import {mat4} from '/js/gl-matrix-3.4.1/index.js';
import {GLUtil} from '/js/gl-util.js';
import {DOM, getIDs, removeFromParent} from '/js/util.js';
import {Mouse3D} from '/js/mouse3d.js';

//shitty new system because how do you call import() blocking
import {makePingPong} from '/js/gl-util-PingPong.js';
import {makeUnitQuad} from '/js/gl-util-UnitQuad.js';

const ids = getIDs();
window.ids = ids;

let mouse;
let canvas;
let gl;
let glutil;
let pingpong;
let updateShader;
let displayShader;

const urlparams = new URLSearchParams(location.search);
let gridsize = +urlparams.get('size');
if (!gridsize) gridsize = 1024;

let inputMethod = document.querySelector('input[name="inputMethod"]:checked').value;

function randomize() {
	let bufferCPU = new Uint8Array(4 * gridsize * gridsize);
	let e = 0;
	for (let j = 0; j < gridsize; ++j) {
		for (let i = 0; i < gridsize; ++i, ++e) {
			let v = 255 * Math.floor(Math.random() * 2);
			bufferCPU[0 + 4 * e] = v;
			bufferCPU[1 + 4 * e] = v;
			bufferCPU[2 + 4 * e] = v;
			bufferCPU[3 + 4 * e] = v;
		}
	}
	pingpong.history.forEach(h => {
		h.bind();
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gridsize, gridsize, gl.RGBA, gl.UNSIGNED_BYTE, bufferCPU);
		h.unbind();
	});
}


function reset() {
	let bufferCPU = new Uint8Array(4 * gridsize * gridsize);
	let e = 0;
	for (let j = 0; j < gridsize; ++j) {
		for (let i = 0; i < gridsize; ++i, ++e) {
			bufferCPU[0 + 4 * e] = 0;
			bufferCPU[1 + 4 * e] = 0;
			bufferCPU[2 + 4 * e] = 0;
			bufferCPU[3 + 4 * e] = 0;
		}
	}

	pingpong.history.forEach(h => {
		h.bind();
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gridsize, gridsize, gl.RGBA, gl.UNSIGNED_BYTE, bufferCPU);
		h.unbind();
	});
}

function initGL() {
	gl.clearColor(.2, .2, .2, 1);

	pingpong = new glutil.PingPong({
		width : gridsize,
		height : gridsize,
		internalFormat : gl.RGBA8,
		format : gl.RGBA,
		type : gl.UNSIGNED_BYTE,
		minFilter : gl.NEAREST,
		magFilter : gl.NEAREST,
		wrap : {
			s : gl.REPEAT,
			t : gl.REPEAT
		}
	});
	pingpong.fbo.bind();
	pingpong.fbo.unbind();
	reset();

	updateShader = new glutil.Program({
		vertexCode : `
in vec2 vertex;
uniform mat4 projMat, mvMat;
out vec2 tc;
void main() {
	tc = vertex.st;
	gl_Position = projMat * mvMat * vec4(vertex, 0., 1.);
}
`,
		fragmentCode :
`const float du = `+glutil.tonumber(1/gridsize)+`;
uniform sampler2D tex;
in vec2 tc;
out vec4 fragColor;
void main() {
	vec4 ll = texture(tex, tc + vec2(-du, -du));
	vec4 lm = texture(tex, tc + vec2(0., -du));
	vec4 lr = texture(tex, tc + vec2(du, -du));
	vec4 ml = texture(tex, tc + vec2(-du, 0.));
	vec4 mm = texture(tex, tc + vec2(0., 0.));
	vec4 mr = texture(tex, tc + vec2(du, 0.));
	vec4 rl = texture(tex, tc + vec2(-du, du));
	vec4 rm = texture(tex, tc + vec2(0., du));
	vec4 rr = texture(tex, tc + vec2(du, du));

	float neighbors = ll.x + lm.x + lr.x + ml.x + mr.x + rl.x + rm.x + rr.x;

#if 1
	float v = 0.;
	if (mm.x == 0. && neighbors == 3.) v = 1.;
	if (mm.x == 1. && (neighbors == 2. || neighbors == 3.)) v = 1.;
#endif

#if 0
	float v = 0.;
	if (neighbors >= 2. - mm.x && neighbors <= 3.) v = 1.;
#endif

#if 0
	float center = 2. + .5 * mm.x;	// we need everything within .7 <- [.5,1] of our epsilon to be true
	float v = neighbors - center;
	v = .75 - v*v;
	v *= 1000.;
	v = clamp(v, 0., 1.);
#endif

	fragColor = vec4(v);

}
`,
		uniforms : {
			tex : 0
		}
	});

	displayShader = new glutil.Program({
		vertexCode : `
in vec2 vertex;
uniform mat4 projMat, mvMat;
out vec2 tc;
void main() {
	tc = vertex;
	gl_Position = projMat * mvMat * vec4(vertex, 0., 1.);
}
`,
		fragmentCode : `
uniform sampler2D tex;
in vec2 tc;
out vec4 fragColor;
void main() {
	fragColor = texture(tex, tc);
}
`,
		uniforms : {
			tex : 0
		}
	});
}

let writeValue = new Uint8Array(4);
writeValue[0] = 255;
writeValue[1] = 255;
writeValue[2] = 255;
writeValue[3] = 255;

let lastX = undefined;
let lastY = undefined;
function update() {
	glutil.draw();

	//TODO just draw a 1x1 quad over the correct pixel
	if (inputMethod == 'draw' && mouse.isDown) {
		let ar = canvas.width / canvas.height;
		let thisX = (mouse.xf - .5) * 2 * glutil.view.fovY * ar + glutil.view.pos[0];
		let thisY = (1 - mouse.yf - .5) * 2 * glutil.view.fovY + glutil.view.pos[1];
		thisX = Math.floor(thisX * gridsize + .5);
		thisY = Math.floor(thisY * gridsize + .5);
		if (lastX === undefined) lastX = thisX;
		if (lastY === undefined) lastY = thisY;

		let dx = thisX - lastX;
		let dy = thisY - lastY;
		let d = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), 1));

		for (let i = .5; i <= d; ++i) {
			let f = i / d;
			let _f = 1 - f;
			let xc = Math.floor(.5 + _f * thisX + f * lastX);
			let yc = Math.floor(.5 + _f * thisY + f * lastY);

			let radius = 3;
			for (let x = xc-radius; x <= xc+radius; ++x) {
				for (let y = yc-radius; y <= yc+radius; ++y) {
					if (x >= 0 && x < gridsize && y >= 0 && y < gridsize) {
						/* TODO draw a single GL_POINT here:
						pingpong.draw({
							callback : () => {
								gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
							}
						});
						*/
						pingpong.current().bind();
						gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, writeValue)
						pingpong.current().unbind();
					}
				}
			}
		}

		lastX = thisX;
		lastY = thisY;
	}

	let fboProjMat = mat4.create();
	mat4.identity(fboProjMat);
	mat4.ortho(fboProjMat, 0, 1, 0, 1, -1, 1);
	let fboMvMat = mat4.create();
	mat4.identity(fboMvMat);

	pingpong.swap();
	pingpong.draw({
		viewport : [0,0,gridsize,gridsize],
		callback : () => {
			glutil.UnitQuad.unitQuad.draw({
				shader : updateShader,
				texs : [pingpong.previous()],
				uniforms : {
					projMat : fboProjMat,
					mvMat : fboMvMat
				}
			});
		},
	});

	glutil.UnitQuad.unitQuad.draw({
		shader : displayShader,
		texs : [pingpong.current()]
	});

	//requestAnimationFrame(update);
	setTimeout(update, 0);
}

canvas = DOM('canvas', {
	css : {
		left : 0,
		top : 0,
		position : 'absolute',
		userSelect : 'none',
	},
	prependTo : document.body,
});

try {
	glutil = new GLUtil({
		canvas : canvas,
		fullscreen : true
	});
	gl = glutil.context;
} catch (e) {
	removeFromParent(canvas);
	throw e;
}
glutil.import('PingPong', makePingPong);
glutil.import('UnitQuad', makeUnitQuad);

mouse = new Mouse3D({
	pressObj : canvas,
	move : (dx,dy) => {
		if (inputMethod == 'pan') {
			glutil.view.pos[0] -= dx / canvas.height * 2 * glutil.view.fovY;
			glutil.view.pos[1] += dy / canvas.height * 2 * glutil.view.fovY;
			glutil.updateProjection();
		}
	},
	zoom : (dz) => {
		glutil.view.fovY *= Math.exp(-.1 * dz / canvas.height);
		glutil.updateProjection();
	},
	mousedown : () => {
		lastX = undefined;
		lastY = undefined;
	}
});

glutil.view.ortho = true;
glutil.view.zNear = -1;
glutil.view.zFar = 1;
glutil.view.fovY = .5;
glutil.view.pos[0] = .5;
glutil.view.pos[1] = .5;
glutil.updateProjection();

const maxsize =  gl.getParameter(gl.MAX_TEXTURE_SIZE);
if (gridsize > maxsize) gridsize = maxsize;
const gridsizes = ids.gridsize;
for (let size = 32; size <= maxsize; size<<=1) {
	const option = DOM('option', {
		text : size,
		value : size,
	});
	if (size == gridsize) option.setAttribute('selected', 'true');
	gridsizes.append(option);
}
gridsizes.addEventListener('change', e => {
	const params = new URLSearchParams(urlparams);
	params.set('size', gridsizes.value);
	location.href = location.origin + location.pathname + '?' + params.toString();
});

const buttonCallbacks = {
	randomize : randomize,
	reset : reset,
};
Object.entries(buttonCallbacks).forEach(entry => {
	const [field, cb] = entry;
	ids[field].addEventListener('click', e => {
		cb();
	});
});

// TODO here and topple a better way ...
const updateRadio = () => {
	for (let k in ids) {
		if (k.substr(0,11) == 'inputMethod') {
			ids[k].checked = ids[k].value == inputMethod;
		}
	}
};
ids.inputMethod_pan.addEventListener('click', e => { inputMethod = 'pan'; });
ids.inputMethod_draw.addEventListener('click', e => { inputMethod = 'draw'; });
ids.button_pan.addEventListener('click', e => { inputMethod = 'pan'; updateRadio(); });
ids.button_draw.addEventListener('click', e => { inputMethod = 'draw'; updateRadio(); });

initGL();
update();
