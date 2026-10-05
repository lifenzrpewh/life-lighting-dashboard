// A stand-in NDI source, for the NDI views (src/shared/ndi.ts), through the
// same runtime and koffi the worker uses. Publishes "Paua test" at 1280×720,
// 50 fps: four patches whose colours are known exactly, so the view's canvas
// can be read back and checked, a patch at half alpha (drawn on black it
// reads half), and a bar crossing the bottom so a frozen picture shows.
//
//   node spikes/ndi-test-sender.cjs [seconds]
//
// Patches, as the canvas should read them: (255,0,0) (0,128,0) (0,0,64)
// (200,200,200), and the half-alpha white one about (128,128,128).

const koffi = require('koffi')
const path = require('node:path')

const dir = process.env.NDI_RUNTIME_DIR_V6 || process.env.NDI_RUNTIME_DIR_V5 || path.join(process.env.ProgramFiles || 'C:/Program Files', 'NDI', 'NDI 5 Runtime', 'v5')
const lib = koffi.load(path.join(dir, 'Processing.NDI.Lib.x64.dll'))
koffi.struct('NDIlib_send_create_t', { p_ndi_name: 'const char *', p_groups: 'const char *', clock_video: 'bool', clock_audio: 'bool' })
koffi.struct('NDIlib_video_frame_v2_t', {
	xres: 'int',
	yres: 'int',
	FourCC: 'uint32_t',
	frame_rate_N: 'int',
	frame_rate_D: 'int',
	picture_aspect_ratio: 'float',
	frame_format_type: 'int',
	timecode: 'int64_t',
	p_data: 'uint8_t *',
	line_stride_in_bytes: 'int',
	p_metadata: 'const char *',
	timestamp: 'int64_t',
})
const initialize = lib.func('bool NDIlib_initialize()')
const sendCreate = lib.func('void *NDIlib_send_create(const NDIlib_send_create_t *)')
const sendVideo = lib.func('void NDIlib_send_send_video_v2(void *, const NDIlib_video_frame_v2_t *)')
const sendDestroy = lib.func('void NDIlib_send_destroy(void *)')

const W = 1280
const H = 720
const BGRA = 0x41524742
const TIMECODE_SYNTHESIZE = 9223372036854775807n

if (!initialize()) throw new Error('NDI would not start')
// clock_video: NDI paces the sends at the frame rate.
const sender = sendCreate({ p_ndi_name: 'Paua test', p_groups: null, clock_video: true, clock_audio: false })
const pixels = new Uint8Array(W * H * 4)
const fill = (x0, y0, w, h, [r, g, b, a]) => {
	for (let y = y0; y < y0 + h; y++)
		for (let x = x0; x < x0 + w; x++) {
			const i = (y * W + x) * 4
			pixels[i] = b
			pixels[i + 1] = g
			pixels[i + 2] = r
			pixels[i + 3] = a
		}
}
const seconds = Number(process.argv[2] ?? 120)
const started = Date.now()
let frame = 0
console.log(`sending "Paua test" ${W}×${H} for ${seconds} s`)
while (Date.now() - started < seconds * 1000) {
	fill(0, 0, W, H, [0, 0, 0, 255])
	fill(40, 40, 200, 200, [255, 0, 0, 255])
	fill(280, 40, 200, 200, [0, 128, 0, 255])
	fill(520, 40, 200, 200, [0, 0, 64, 255])
	fill(760, 40, 200, 200, [200, 200, 200, 255])
	fill(1000, 40, 200, 200, [255, 255, 255, 128])
	fill((frame * 8) % (W - 40), 600, 40, 80, [255, 255, 0, 255])
	sendVideo(sender, {
		xres: W,
		yres: H,
		FourCC: BGRA,
		frame_rate_N: 50,
		frame_rate_D: 1,
		picture_aspect_ratio: W / H,
		frame_format_type: 1,
		timecode: TIMECODE_SYNTHESIZE,
		p_data: pixels,
		line_stride_in_bytes: W * 4,
		p_metadata: null,
		timestamp: 0n,
	})
	frame += 1
}
sendDestroy(sender)
console.log(`sent ${frame} frames`)
