/**
 * Elements whose code is a lazy chunk: `<showfm-episodes>`, `<showfm-play>`
 * and `<showfm-mini-player>`. v1.js registers a small stub for each, which
 * loads its chunk the first time an element connects and mounts it.
 *
 * Until the chunk is here the element has no shadow root, so its light-DOM
 * fallback (renderEpisodeHTML or renderEpisodeListHTML) stays on show,
 * styled by v1-fallback.css. If the chunk never arrives, the fallback is
 * what the visitor keeps, and the next element to connect tries again.
 *
 * `load="click"`: nothing is fetched, not even the chunk, until the facade
 * the inline loader drew is pressed (it sets data-showfm-activated) or
 * `showfm.load()` runs. Until then the loader's facade, or without the
 * loader the fallback, is what shows.
 */

/** What a chunk's mount function gives back: called with false on disconnect, true on reconnect. */
export type Connection = (connected: boolean) => void;
type Chunk = Record<string, (host: HTMLElement) => Connection>;

/**
 * v1.js's own exports: the bindings the chunks share with it. Only the CDN
 * build has them (vite.cdn.config.ts wraps v1.js and defines this).
 */
declare const exports: object;

const REGISTRY = Symbol.for('showfm.chunks.v1');
const script = typeof document !== 'undefined' ? document.currentScript : null;
const pending: Record<string, Promise<Chunk>> = {};

/**
 * In v1.js, vite.cdn.config.ts renders `import()` as the chunk's path, and
 * this adds the chunk as a script next to v1.js (once, with the page's
 * nonce), then runs the factory it registers. The npm root has registered
 * the factories already, so nothing is fetched there. Anywhere else the
 * import is a real one.
 */
function loadChunk(chunk: string | Promise<unknown>): Promise<Chunk> {
	if (typeof chunk !== 'string') return chunk as Promise<Chunk>;
	const key = chunk.replace(/^\.\//, '');
	return (pending[key] ??= new Promise((resolve, reject) => {
		const registry = ((globalThis as unknown as Record<symbol, Record<string, unknown>>)[
			REGISTRY
		] ??= {}) as Record<string, (shared: () => object, exports: object) => void>;
		const run = () => {
			const exported = {} as Chunk;
			registry[key](() => exports, exported);
			resolve(exported);
		};
		const fail = () => {
			delete pending[key];
			reject(new Error(key));
		};
		if (registry[key]) return run();
		const src = (script as HTMLScriptElement | null)?.src;
		if (!src) return fail();
		const tag = document.createElement('script');
		tag.src = new URL(chunk, src).href;
		if ((script as HTMLScriptElement).nonce) tag.nonce = (script as HTMLScriptElement).nonce;
		tag.onload = () => (registry[key] ? run() : fail());
		tag.onerror = () => {
			tag.remove();
			fail();
		};
		document.head.append(tag);
	}));
}

export const ACTIVATED = 'data-showfm-activated';

/**
 * A stub element class: on its first connection it loads the chunk that
 * `chunk` names and mounts the chunk's `mount` export into it.
 */
export function lazyElement(chunk: () => string | Promise<unknown>, mount: string) {
	return class extends HTMLElement {
		declare showfmConnection?: Connection | null;

		static observedAttributes = [ACTIVATED];

		attributeChangedCallback() {
			if (this.isConnected) this.connectedCallback();
		}

		connectedCallback() {
			if (this.showfmConnection) return this.showfmConnection(true);
			if (this.showfmConnection === null) return;
			if (this.getAttribute('load') === 'click' && !this.hasAttribute(ACTIVATED)) return;
			this.showfmConnection = null;
			loadChunk(chunk()).then(
				(loaded) => {
					this.showfmConnection = loaded[mount](this);
					if (!this.isConnected) this.showfmConnection(false);
				},
				() => delete this.showfmConnection
			);
		}

		disconnectedCallback() {
			this.showfmConnection?.(false);
		}
	};
}

/**
 * Registers `name` if it is free and returns whether this copy did. Then
 * `showfm.load()` (consent tools) presses every one of its load="click"
 * facades at once.
 */
export function defineLazy(name: string, element: CustomElementConstructor): boolean {
	if (customElements.get(name)) return false;
	customElements.define(name, element);
	document.addEventListener('showfm:load', () =>
		document
			.querySelectorAll(`${name}[load="click"]`)
			.forEach((facade) => facade.setAttribute(ACTIVATED, 'load'))
	);
	return true;
}
