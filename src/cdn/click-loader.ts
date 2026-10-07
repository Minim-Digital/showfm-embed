/**
 * The `load="click"` loader: `dist/cdn/click-loader.js`, small enough to
 * paste inline after the elements (design page 6, consent mode).
 *
 * Until a visitor presses a facade, nothing is requested from show.fm or
 * embed.cdn.media: this script draws a facade inside each
 * `[load="click"]` element that knows only the accent, the element type and
 * the reserved height (a play button's is its button alone, in a 40px
 * line). Pressing one adds v1.js once and marks the element,
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
	const TAGS = 'showfm-player,podcasterplus-player,showfm-episodes,showfm-play,showfm-transcript';
	// Each attribute name once: this file is pasted inline, so bytes count.
	const FACADE = 'data-showfm-facade';
	const UI = `${FACADE}-ui`;
	const ACTIVATED = 'data-showfm-activated';
	const FOCUS = 'data-showfm-focus';
	const BUSY = 'aria-busy';
	const script = d.currentScript;
	const src = script?.getAttribute('data-src') || 'https://embed.cdn.media/player/v1.js';
	const nonce = script?.nonce;
	// Per language, one string split at "|" (fewer bytes than an array):
	// the player's title and meta, the list's title and meta, and the
	// transcript's title. Its meta line stays empty: the title says it all.
	const STRINGS: Record<string, string> = {
		en: 'Play podcast episode|Loads from show.fm when you press play|Load episodes|Episodes load from show.fm when you press the button.|Load transcript',
		de: 'Podcastfolge abspielen|Wird beim Abspielen von show.fm geladen|Folgen laden|Die Folgen werden beim Klick von show.fm geladen.|Transkript laden',
		fr: 'Lire l’épisode du podcast|Chargé depuis show.fm à la lecture|Charger les épisodes|Les épisodes se chargent depuis show.fm au clic.|Charger la transcription'
	};
	// The `window.showfmStrings` key of string i: facadeTitle, facadeMeta,
	// facadeListTitle, facadeListMeta, facadeTranscriptTitle.
	const key = (i: number) =>
		`facade${['', 'List', 'Transcript'][i >> 1]}${i & 1 ? 'Meta' : 'Title'}`;
	let added = false;

	const style = d.createElement('style');
	style.textContent =
		// A list, play button or transcript never shows its light DOM behind
		// the facade, and is defined (a stub in v1.js) before its code mounts.
		`[${FACADE}]:is(showfm-episodes,showfm-play,showfm-transcript,:not(:defined))>:not([${UI}]){display:none}` +
		`[${UI}]{box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;gap:10px;width:100%;min-height:var(--h);padding:20px 22px;border:1px solid #e7e5ec;border-radius:14px;background:#fff;color:#2b2833;font:14px/1.4 Geist,system-ui,sans-serif;text-align:left}` +
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
		`[${UI}] i{height:3px;border-radius:3px;background:currentColor;opacity:.15}` +
		// The play button's facade: its 34px button alone, in a 40px line.
		`[${UI}][data-p]{display:inline-flex;width:auto;padding:0;border:0;background:none}[${UI}][data-p] :is(span,i){display:none}`;
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

	/** Calls `f` for each element `selector` matches (once here: bytes count). */
	const each = (selector: string, f: (el: Element) => void) =>
		d.querySelectorAll(selector).forEach(f);

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
				each(`[${ACTIVATED}]:not(:defined)`, (pressed) => {
					pressed.removeAttribute(ACTIVATED);
					pressed.removeAttribute(FOCUS);
					pressed.querySelector(`[${UI}] button`)?.removeAttribute(BUSY);
				});
			};
			d.head.append(tag);
		}
	};

	const draw = (el: Element) => {
		const tag = el.localName;
		if (el.hasAttribute(FACADE) || customElements.get(tag)) return;
		el.setAttribute(FACADE, '');
		const get = (name: string) => el.getAttribute(name);
		const lang = (get('lang') || d.documentElement.lang || '').slice(0, 2).toLowerCase();
		const table = (STRINGS[lang] || STRINGS.en).split('|');
		// The transcript has no meta (string 5): undefined sets no text.
		const text = (i: number) => (w.showfmStrings?.[key(i)] || table[i]) as string;
		const list = tag === 'showfm-episodes';
		const play = tag === 'showfm-play';
		// A transcript loads like a list, in the height its element reserves.
		const transcript = tag === 'showfm-transcript';
		// Its strings: the player's (0), the list's (2) or the transcript's (4).
		const strings = transcript ? 4 : list ? 2 : 0;
		const accentAttr = get('accent') || '';
		const accent = /^#([0-9a-f]{3}){1,2}$/i.test(accentAttr) ? accentAttr : '#7E22CE';
		const theme = get('theme');
		const compact = play || get('size') === 'compact';

		const box = d.createElement('div');
		box.setAttribute(UI, '');
		if (compact) box.setAttribute('data-c', '');
		if (play) box.setAttribute('data-p', '');
		box.setAttribute(`data-${theme === 'dark' ? 'd' : theme === 'light' ? 'l' : 'a'}`, '');
		box.style.cssText = `--a:${accent};--f:${onAccent(accent)};--h:${strings ? `var(--showfm-height,${list ? 0 : 377}px)` : play ? '40px' : compact ? '83px' : '252px'}`;
		box.innerHTML =
			'<div><button type="button"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></button><span><b aria-hidden="true"></b><small></small></span></div><i aria-hidden="true"></i>';
		const button = box.querySelector('button')!;
		const title = text(strings);
		button.setAttribute('aria-label', title);
		box.querySelector('b')!.textContent = title;
		box.querySelector('small')!.textContent = text(strings + 1);
		button.onclick = () => activate(el, strings ? 'load' : 'play', button);
		el.prepend(box);
	};

	const scan = () => each(`:is(${TAGS})[load="click"]`, draw);

	const showfm = (w.showfm ||= {});
	showfm.load = () => {
		// Facades for elements added since, then every facade is marked. The
		// mark is an attribute, so it waits for v1.js: an element reads it when
		// it upgrades, however late v1.js arrives, and marking twice is the same.
		scan();
		each(`[${FACADE}]:not(:defined)`, (el) =>
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
