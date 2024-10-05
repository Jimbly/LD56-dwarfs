#pragma WebGL2

precision lowp float;

uniform sampler2D tex0; // source
uniform sampler2D tex1; // dither

varying lowp vec4 interp_color;
varying vec2 interp_texcoord;
uniform float dither_param;
uniform vec4 uv_scale;

void main(void) {
  vec4 tex_screen = texture2D(tex0, interp_texcoord);
  vec4 tex_dither = texture2D(tex1, vec2(interp_texcoord.x, 1.0 - interp_texcoord.y) * uv_scale.zw);
  gl_FragColor = vec4(tex_screen.rgb, tex_dither.r < dither_param ? 1.0 : 0.0);
}
