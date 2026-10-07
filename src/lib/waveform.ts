/**
 * Waveform scrubber visuals (from the AudioPlayerRedesign design project).
 *
 * The peaks are DECORATIVE — deterministic pseudo-peaks seeded from the
 * episode (stable across loads), not decoded audio. The real seeking control
 * is the transparent native range input overlaid on the canvas; this module
 * only paints. Pure + dependency-free for the player bundle; genPeaks is
 * unit-tested, drawing is exercised in the browser.
 */

export interface WaveDrawOptions {
	/** 0..1 played fraction */
	progress: number;
	/** Bar color for the played portion (theme-resolved accent) */
	played: string;
	/** Bar color for the remainder */
	track: string;
	/** Knob outline color for the plain-bar fallback (the card background) */
	knobRing: string;
	compact: boolean;
	/** false → plain rounded bar + knob instead of waveform bars */
	wave: boolean;
	peaks: number[];
}

/**
 * Deterministic pseudo-peaks (mulberry32 over an FNV-style seed), smoothed and
 * shaped by a sine envelope, normalized to 0.09..1. Same seed → same waveform.
 */
export function genPeaks(seed: string, count = 220): number[] {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	let a = h >>> 0;
	const rand = () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const raw: number[] = [];
	for (let i = 0; i < count; i++) {
		const envelope = 0.4 + 0.6 * Math.sin((Math.PI * i) / count);
		raw.push((0.22 + rand() * 0.78) * envelope);
	}
	const smoothed = raw.map((v, i) => {
		const prev = raw[i - 1] ?? v;
		const next = raw[i + 1] ?? v;
		return (v * 2 + prev + next) / 4;
	});
	const max = Math.max(...smoothed) || 1;
	return smoothed.map((v) => Math.max(0.09, v / max));
}

function roundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	const radius = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + w, y, x + w, y + h, radius);
	ctx.arcTo(x + w, y + h, x, y + h, radius);
	ctx.arcTo(x, y + h, x, y, radius);
	ctx.arcTo(x, y, x + w, y, radius);
	ctx.closePath();
}

/** Paint the scrubber into the canvas at its current CSS size (DPR-aware). */
export function drawWave(canvas: HTMLCanvasElement, options: WaveDrawOptions): void {
	const w = canvas.clientWidth;
	const h = canvas.clientHeight;
	if (!w || !h) return;
	const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
	}
	const ctx = canvas.getContext('2d');
	if (!ctx) return; // jsdom / uninstantiable context — visuals only, seeking still works
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, w, h);

	const progress = Math.max(0, Math.min(1, options.progress));

	if (options.wave && options.peaks.length > 0) {
		const gap = options.compact ? 2 : 2.5;
		const targetBarWidth = options.compact ? 3 : 3.5;
		const n = Math.max(
			16,
			Math.min(options.peaks.length, Math.floor((w + gap) / (targetBarWidth + gap)))
		);
		const barWidth = (w - (n - 1) * gap) / n;
		for (let i = 0; i < n; i++) {
			const peak = options.peaks[Math.floor((i / n) * options.peaks.length)];
			const barHeight = Math.max(2, peak * (h - 2));
			const x = i * (barWidth + gap);
			const y = (h - barHeight) / 2;
			ctx.fillStyle = (x + barWidth / 2) / w <= progress ? options.played : options.track;
			roundedRect(ctx, x, y, barWidth, barHeight, Math.min(barWidth / 2, 1.6));
			ctx.fill();
		}
		return;
	}

	// Plain-bar fallback (wave=false): rounded track + progress + ringed knob
	const barHeight = options.compact ? 4 : 5;
	const y = (h - barHeight) / 2;
	ctx.fillStyle = options.track;
	roundedRect(ctx, 0, y, w, barHeight, barHeight / 2);
	ctx.fill();
	ctx.fillStyle = options.played;
	roundedRect(ctx, 0, y, Math.max(barHeight, w * progress), barHeight, barHeight / 2);
	ctx.fill();
	const knobRadius = options.compact ? 5 : 6;
	const knobX = Math.max(barHeight, Math.min(w - knobRadius, w * progress));
	ctx.beginPath();
	ctx.arc(knobX, h / 2, knobRadius, 0, Math.PI * 2);
	ctx.fillStyle = options.played;
	ctx.fill();
	ctx.lineWidth = 2;
	ctx.strokeStyle = options.knobRing;
	ctx.stroke();
}
