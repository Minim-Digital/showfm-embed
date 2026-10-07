/**
 * Waveform scrubber visuals: deterministic seeded peaks (same episode → same
 * waveform on every load) and a crash-free draw path where canvas 2D contexts
 * don't exist (jsdom) — the visual layer must never break seeking.
 */
import { describe, expect, it } from 'vitest';
import { drawWave, genPeaks } from '../waveform';

describe('genPeaks', () => {
	it('is deterministic for the same seed and differs across seeds', () => {
		const a1 = genPeaks('episode-1');
		const a2 = genPeaks('episode-1');
		const b = genPeaks('episode-2');
		expect(a1).toEqual(a2);
		expect(a1).not.toEqual(b);
	});

	it('produces the requested count within the 0.09..1 range', () => {
		const peaks = genPeaks('seed', 220);
		expect(peaks).toHaveLength(220);
		expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0.09);
		expect(Math.max(...peaks)).toBeLessThanOrEqual(1);
	});
});

describe('drawWave', () => {
	function canvasStub(width: number, height: number): HTMLCanvasElement {
		const canvas = document.createElement('canvas');
		Object.defineProperty(canvas, 'clientWidth', { value: width });
		Object.defineProperty(canvas, 'clientHeight', { value: height });
		return canvas;
	}

	const options = {
		progress: 0.5,
		played: '#7E22CE',
		track: '#DBD8E3',
		knobRing: '#ffffff',
		compact: false,
		wave: true,
		peaks: genPeaks('seed')
	};

	it('does not throw when the 2D context is unavailable (jsdom)', () => {
		expect(() => drawWave(canvasStub(560, 46), options)).not.toThrow();
	});

	it('does not throw for zero-size canvases or the bar fallback', () => {
		expect(() => drawWave(canvasStub(0, 0), options)).not.toThrow();
		expect(() => drawWave(canvasStub(300, 26), { ...options, wave: false })).not.toThrow();
	});
});
