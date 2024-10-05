#pragma WebGL2

precision lowp float;

uniform sampler2D tex0;

varying lowp vec4 interp_color;
varying vec2 interp_texcoord;
uniform float dither_param;

void main(void) {
  vec4 tex = texture2D(tex0, interp_texcoord);
  gl_FragColor = vec4(interp_color.rgb, tex.r < dither_param ? 1.0 : 0.0);
}
