var canvas;
var gl;
var glutil;

var gridsize = +$.url().param('size');
if (gridsize !== gridsize) gridsize = 1024;

var inputMethod = 'pan';

function randomize() {
	var bufferCPU = new Uint8Array(4 * gridsize * gridsize);
	var e = 0;
	for (var j = 0; j < gridsize; ++j) {
		for (var i = 0; i < gridsize; ++i, ++e) {
			var v = 255 * Math.floor(Math.random() * 2);
			bufferCPU[0 + 4 * e] = v; 
			bufferCPU[1 + 4 * e] = v;
			bufferCPU[2 + 4 * e] = v;
			bufferCPU[3 + 4 * e] = v;
		}
	}

	$.each(pingpong.history, function(i,h) {
		h.bind();
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gridsize, gridsize, gl.RGBA, gl.UNSIGNED_BYTE, bufferCPU);
		h.unbind();
	});
}


function reset() {
	var bufferCPU = new Uint8Array(4 * gridsize * gridsize);
	var e = 0;
	for (var j = 0; j < gridsize; ++j) {
		for (var i = 0; i < gridsize; ++i, ++e) {
			bufferCPU[0 + 4 * e] = 0; 
			bufferCPU[1 + 4 * e] = 0;
			bufferCPU[2 + 4 * e] = 0;
			bufferCPU[3 + 4 * e] = 0;
		}
	}

	$.each(pingpong.history, function(i,h) {
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

	var glstr = function(x) {
		var s = ''+x;
		if (s.indexOf('.') == -1) s += '.';
		return s;
	};

	updateShader = new glutil.ShaderProgram({
		vertexPrecision : 'best',
		vertexCode : mlstr(function(){/*
attribute vec2 vertex;
uniform mat4 projMat, mvMat;
varying vec2 tc;
void main() {
	tc = vertex.st;
	gl_Position = projMat * mvMat * vec4(vertex, 0., 1.);
}
*/}),
		fragmentPrecision : 'best',
		fragmentCode : 
		
'const float du = '+glstr(1/gridsize)+';\n'+
mlstr(function(){/*
uniform sampler2D tex;
varying vec2 tc;
void main() {
	vec4 ll = texture2D(tex, tc + vec2(-du, -du));
	vec4 lm = texture2D(tex, tc + vec2(0., -du));
	vec4 lr = texture2D(tex, tc + vec2(du, -du));
	vec4 ml = texture2D(tex, tc + vec2(-du, 0.));
	vec4 mm = texture2D(tex, tc + vec2(0., 0.));
	vec4 mr = texture2D(tex, tc + vec2(du, 0.));
	vec4 rl = texture2D(tex, tc + vec2(-du, du));
	vec4 rm = texture2D(tex, tc + vec2(0., du));
	vec4 rr = texture2D(tex, tc + vec2(du, du));

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

	gl_FragColor = vec4(v);

}
*/}),
		uniforms : {
			tex : 0
		}
	});

	displayShader = new glutil.ShaderProgram({
		vertexPrecision : 'best',
		vertexCode : mlstr(function(){/*
attribute vec2 vertex;
uniform mat4 projMat, mvMat;
varying vec2 tc;
void main() {
	tc = vertex;
	gl_Position = projMat * mvMat * vec4(vertex, 0., 1.);
}
*/}),
		fragmentPrecision : 'best',
		fragmentCode : mlstr(function(){/*
uniform sampler2D tex;
varying vec2 tc;
void main() {
	gl_FragColor = texture2D(tex, tc);
}
*/}),
		uniforms : {
			tex : 0
		}
	});
}

var writeValue = new Uint8Array(4);
writeValue[0] = 255;
writeValue[1] = 255; 
writeValue[2] = 255; 
writeValue[3] = 255; 

var lastX = undefined;
var lastY = undefined;
function update() {
	glutil.draw();

	//TODO just draw a 1x1 quad over the correct pixel
	if (inputMethod == 'draw' && mouse.isDown) {
		var ar = canvas.width / canvas.height;
		var thisX = (mouse.xf - .5) * 2 * glutil.view.fovY * ar + glutil.view.pos[0];
		var thisY = (1 - mouse.yf - .5) * 2 * glutil.view.fovY + glutil.view.pos[1];
		thisX = Math.floor(thisX * gridsize + .5);
		thisY = Math.floor(thisY * gridsize + .5);
		if (lastX === undefined) lastX = thisX;
		if (lastY === undefined) lastY = thisY;

		var dx = thisX - lastX;
		var dy = thisY - lastY;
		var d = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), 1));

		for (var i = .5; i <= d; ++i) {
			var f = i / d;
			var _f = 1 - f;
			var xc = Math.floor(.5 + _f * thisX + f * lastX);
			var yc = Math.floor(.5 + _f * thisY + f * lastY);

			var radius = 3;
			for (var x = xc-radius; x <= xc+radius; ++x) {
				for (var y = yc-radius; y <= yc+radius; ++y) {
					if (x >= 0 && x < gridsize && y >= 0 && y < gridsize) {
						/* TODO draw a single GL_POINT here:
						pingpong.draw({
							callback : function() {
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

	var fboProjMat = mat4.create();
	mat4.identity(fboProjMat);
	mat4.ortho(fboProjMat, 0, 1, 0, 1, -1, 1);
	var fboMvMat = mat4.create();
	mat4.identity(fboMvMat);

	pingpong.swap();
	pingpong.draw({
		viewport : [0,0,gridsize,gridsize],
		callback : function() {
			glutil.unitQuad.draw({
				shader : updateShader,
				texs : [pingpong.previous()],
				uniforms : {
					projMat : fboProjMat,
					mvMat : fboMvMat 
				}
			});
		},
	});
	
	glutil.unitQuad.draw({
		shader : displayShader,
		texs : [pingpong.current()]
	});

	//requestAnimFrame(update);
	setTimeout(update, 0);
}

$(document).ready(function(){
	canvas = $('<canvas>', {
		css : {
			left : 0,
			top : 0,
			position : 'absolute'
		}
	}).prependTo(document.body).get(0);
	$(canvas).disableSelection()

	try {
		glutil = new GLUtil({
			canvas : canvas,
			fullscreen : true
		});
		gl = glutil.context;
	} catch (e) {
		$(canvas).remove(); throw e;
	}

	mouse = new Mouse3D({
		pressObj : canvas,
		move : function(dx,dy) {
			if (inputMethod == 'pan') {
				glutil.view.pos[0] -= dx / canvas.height * 2 * glutil.view.fovY;
				glutil.view.pos[1] += dy / canvas.height * 2 * glutil.view.fovY;
				glutil.updateProjection();
			} 
		},
		zoom : function(dz) {
			glutil.view.fovY *= Math.exp(-.1 * dz / canvas.height);
			glutil.updateProjection();
		},
		mousedown : function() {
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

	var maxsize =  gl.getParameter(gl.MAX_TEXTURE_SIZE);
	if (gridsize > maxsize) gridsize = maxsize;
	var gridsizes = $('#gridsize');
	for (var size = 32; size <= maxsize; size<<=1) {
		var option = $('<option>', {
			text : size,
			value : size
		});
		if (size == gridsize) option.attr('selected', 'true');
		gridsizes.append(option);
	}
	gridsizes.change(function() {
		var params = $.url().param();
		params.size = gridsizes.val();
		var url = location.href.match('[^?]*')[0];
		var sep = '?';
		for (k in params) {
			if (k != '') {
				url += sep;
				url += k + '=' + params[k];
				sep = '&';
			}
		}
		location.href = url;
	});

	$.each(['randomize', 'reset'], function(i, field) {
		$('#'+field).click(function() {
			window[field]();
		});
	});

	//https://stackoverflow.com/questions/4618733/set-selected-radio-from-radio-group-with-a-value#4618748
	var updateRadio = function() { $('input[name=inputMethod]').val([inputMethod]); };
	$('#inputMethod_pan').click(function() { inputMethod = 'pan'; });
	$('#inputMethod_draw').click(function() { inputMethod = 'draw'; });
	$('#button_pan').click(function() { inputMethod = 'pan'; updateRadio(); });
	$('#button_draw').click(function() { inputMethod = 'draw'; updateRadio(); });

	initGL();
	update();
});
