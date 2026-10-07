/**
 * The `load="click"` loader: `dist/cdn/click-loader.js`, small enough to
 * paste inline after the elements (design page 6, consent mode).
 *
 * Until a visitor presses a facade, nothing is requested from show.fm or
 * embed.cdn.media: this script draws a facade inside each
 * `[load="click"]` element that knows only the accent, the element type and
 * the reserved height. Pressing one adds v1.js once and marks the element,
 * so it loads (and, for a player or play button, plays) as soon as it
 * upgrades. Other facades stay facades until they are pressed.
 * `showfm.load()` upgrades every facade at once, for consent tools.
 *
 *   <script data-src="https://embed.cdn.media/player/v1.js">…this file…</script>
 *
 * `data-src` points at a self-hosted copy of v1.js (the WordPress plugin
 * bundles one). The facade is drawn in the light DOM because the element
 * creates its shadow root when it upgrades; the upgraded element removes it.
 *
 * Kept deliberately plain: no imports, and each string once per language.
 */
((
	d: Document,
	w: Window & { showfm?: { load?: () => void }; showfmStrings?: Record<string, string> }
) => {
	const TAGS = 'showfm-player,podcasterplus-player,showfm-episodes,showfm-play';
	// Each attribute name once: this file is pasted inline, so bytes count.
	const FACADE = 'data-showfm-facade';
	const UI = `${FACADE}-ui`;
	const ACTIVATED = 'data-showfm-activated';
	const FOCUS = 'data-showfm-focus';
	const BUSY = 'aria-busy';
	const script = d.currentScript;
	const src = script?.getAttribute('data-src') || 'https://embed.cdn.media/player/v1.js';
	const nonce = script?.nonce;
	// [player title, player meta, list title, list meta] per language.
	const STRINGS: Record<string, string[]> = {
		en: [
			'Play podcast episode',
			'Loads from show.fm when you press play',
			'Load episodes',
			'Episodes load from show.fm when you press the button.'
		],
		de: [
			'Podcastfolge abspielen',
			'Wird beim Abspielen von show.fm geladen',
			'Folgen laden',
			'Die Folgen werden beim Klick von show.fm geladen.'
		],
		fr: [
			'Lire l’épisode du podcast',
			'Chargé depuis show.fm à la lecture',
			'Charger les épisodes',
			'Les épisodes se chargent depuis show.fm au clic.'
		]
	};
	const KEYS = ['facadeTitle', 'facadeMeta', 'facadeListTitle', 'facadeListMeta'];
	let added = false;

	const style = d.createElement('style');
	style.textContent =
		`:is(${TAGS})[${FACADE}]:not(:defined)>:not([${UI}]){display:none}` +
		`[${UI}]{box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;gap:10px;width:100%;min-height:var(--h);padding:20px 22px;border:1px solid #e7e5ec;border-radius:14px;background:#fff;color:#2b2833;font:14px/1.4 Geist,ui-sans-serif,system-ui,sans-serif;text-align:left}` +
		`[${UI}][data-c]{padding:12px 14px}[${UI}][data-d]{background:#17151f;border-color:#ffffff1a;color:#ecebf0}` +
		`@media(prefers-color-scheme:dark){[${UI}][data-a]{background:#17151f;border-color:#ffffff1a;color:#ecebf0}}` +
		`[${UI}] div{display:flex;align-items:center;gap:14px;min-width:0}` +
		`[${UI}] button{position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;margin:0;padding:0 0 0 2px;border:0;border-radius:99px;background:var(--a);color:var(--f);cursor:pointer}` +
		`[${UI}][data-c] button{width:34px;height:34px}` +
		`[${UI}] button[aria-busy=true]:after{content:"";position:absolute;inset:-4px;border:2px solid transparent;border-top-color:var(--a);border-radius:99px;animation:showfm-spin .9s linear infinite}` +
		`@keyframes showfm-spin{to{transform:rotate(1turn)}}` +
		`[${UI}] span{display:flex;flex-direction:column;gap:3px;min-width:0}` +
		`[${UI}] b,[${UI}] small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}` +
		`[${UI}] b{font-size:16px;line-height:1.3}[${UI}][data-c] b{font-size:14px;line-height:1.25}` +
		`[${UI}] small{font-size:13px;opacity:.75}[${UI}][data-c] small{font-size:11.5px}` +
		`[${UI}] i{height:3px;border-radius:3px;background:currentColor;opacity:.15}`;
	d.head.append(style);

	/** WCAG: white on the accent unless black has the better contrast. */
	const onAccent = (hex: string) => {
		const digits = hex.slice(1);
		const n = parseInt(digits.length === 3 ? digits.replace(/\w/g, '$&$&') : digits, 16);
		const lum = [n >> 16, (n >> 8) & 255, n & 255]
			.map((c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
			.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
		return lum <= 0.17913 ? '#fff' : '#000';
	};

	const activate = (el: Element, mode: string, button?: Element | null) => {
		el.setAttribute(ACTIVATED, mode);
		if (button) {
			button.setAttribute(BUSY, 'true');
			if (d.activeElement === button) el.setAttribute(FOCUS, '');
		}
		if (!added && !customElements.get('showfm-player')) {
			added = true;
			const tag = d.createElement('script');
			tag.src = src;
			if (nonce) tag.nonce = nonce;
			tag.async = true;
			// A failed load (network, CDN) must not strand the page: every
			// pressed facade becomes pressable again, focus stays where it is,
			// and the next press adds the script afresh.
			tag.onerror = () => {
				added = false;
				tag.remove();
				d.querySelectorAll(`[${ACTIVATED}]:not(:defined)`).forEach((pressed) => {
					pressed.removeAttribute(ACTIVATED);
					pressed.removeAttribute(FOCUS);
					pressed.querySelector(`[${UI}] button`)?.removeAttribute(BUSY);
				});
			};
			d.head.append(tag);
		}
	};

	const draw = (el: Element) => {
		if (el.hasAttribute(FACADE) || customElements.get(el.localName)) return;
		el.setAttribute(FACADE, '');
		const lang = (el.getAttribute('lang') || d.documentElement.lang || '')
			.slice(0, 2)
			.toLowerCase();
		const table = STRINGS[lang] || STRINGS.en;
		const text = (i: number) => w.showfmStrings?.[KEYS[i]] || table[i];
		const list = el.localName === 'showfm-episodes';
		const accentAttr = el.getAttribute('accent') || '';
		const accent = /^#([0-9a-f]{3}){1,2}$/i.test(accentAttr) ? accentAttr : '#7E22CE';
		const theme = el.getAttribute('theme');
		const compact = el.getAttribute('size') === 'compact';

		const box = d.createElement('div');
		box.setAttribute(UI, '');
		if (compact) box.setAttribute('data-c', '');
		box.setAttribute(theme === 'dark' ? 'data-d' : theme === 'light' ? 'data-l' : 'data-a', '');
		box.style.cssText = `--a:${accent};--f:${onAccent(accent)};--h:${list ? 'var(--showfm-height,0px)' : compact ? '83px' : '252px'}`;
		box.innerHTML =
			'<div><button type="button"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></button><span><b aria-hidden="true"></b><small></small></span></div><i aria-hidden="true"></i>';
		const button = box.querySelector('button')!;
		const title = text(list ? 2 : 0);
		button.setAttribute('aria-label', title);
		box.querySelector('b')!.textContent = title;
		box.querySelector('small')!.textContent = text(list ? 3 : 1);
		button.onclick = () => activate(el, list ? 'load' : 'play', button);
		el.prepend(box);
	};

	const scan = () => d.querySelectorAll(`:is(${TAGS})[load="click"]`).forEach(draw);

	const showfm = (w.showfm ||= {});
	showfm.load = () => {
		d.querySelectorAll(`[${FACADE}]:not(:defined)`).forEach((el) =>
			activate(el, 'load', el.querySelector(`[${UI}] button`))
		);
		// Elements that upgraded already listen for this.
		d.dispatchEvent(new Event('showfm:load'));
	};

	scan();
	d.addEventListener('DOMContentLoaded', scan);
})(document, window);

// A module for TypeScript; the build wraps it as a classic script.
export {};
