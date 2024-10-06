#pragma WebGL2
precision mediump float;
precision mediump int;

uniform sampler2D tex0;

varying lowp vec4 interp_color;
varying highp vec2 interp_texcoord;
uniform vec4 params;
uniform vec4 uvscale;
uniform vec4 uvscale2;
uniform vec4 c0;
uniform vec4 c1;
uniform vec4 c2;
uniform vec4 c3;

// Partially From: https://www.shadertoy.com/view/lsl3RH
// Created by inigo quilez - iq/2013
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// See here for a tutorial on how to make this: http://www.iquilezles.org/www/articles/warp/warp.htm

const mat2 m = mat2( 0.80,  0.60, -0.60,  0.80 );

float noise( in vec2 x )
{
  return sin(1.5*x.x)*sin(1.5*x.y);
}

float fbm4( vec2 p )
{
  float f = 0.0;
  f += 0.5000*noise( p ); p = m*p*2.02;
  f += 0.2500*noise( p ); p = m*p*2.03;
  f += 0.1250*noise( p ); p = m*p*2.01;
  f += 0.0625*noise( p );
  return f/0.9375;
}

float fbm6( vec2 p )
{
  float f = 0.0;
  f += 0.500000*(0.5+0.5*noise( p )); p = m*p*2.02;
  f += 0.250000*(0.5+0.5*noise( p )); p = m*p*2.03;
  f += 0.125000*(0.5+0.5*noise( p )); p = m*p*2.01;
  f += 0.062500*(0.5+0.5*noise( p )); p = m*p*2.04;
  f += 0.031250*(0.5+0.5*noise( p )); p = m*p*2.01;
  f += 0.015625*(0.5+0.5*noise( p ));
  return f/0.96875;
}


float func( vec2 q )
{
  float iTime = params.w;
  float ql = length( q );
  q.x += 0.05*sin(0.27*iTime+ql*4.1);
  q.y += 0.05*sin(0.23*iTime+ql*4.3);
  q *= 0.5;

  vec2 o = vec2(0.0);
  o.x = 0.5 + 0.5*fbm4( vec2(2.0*q          )  );
  o.y = 0.5 + 0.5*fbm4( vec2(2.0*q+vec2(5.2))  );

  float ol = length( o );
  o.x += 0.02*sin(0.12*iTime+ol)/ol;
  o.y += 0.02*sin(0.14*iTime+ol)/ol;

  vec2 n;
  n.x = fbm6( vec2(4.0*o+vec2(9.2))  );
  n.y = fbm6( vec2(4.0*o+vec2(5.7))  );

  vec2 p = 4.0*q + 4.0*n;

  float f = 0.5 + 0.5*fbm4( p );

  f = mix( f, f*f*f*3.5, f*abs(n.x) );

  float g = 0.5 + 0.5*sin(4.0*p.x)*sin(4.0*p.y);
  f *= 1.0-0.5*pow( g, 8.0 );

  return f;
}



vec3 doMagic(vec2 p)
{
  vec2 q = p*5.0;

  float f = func(q);

  f = clamp(f * 1.4 - 0.4, 0.0, 1.0);

  vec4 tex = texture2D(tex0, interp_texcoord);
  if (f < 0.25) {
    return mix(c0.rgb, c1.rgb, tex.r < f*4.0 ? 1.0 : 0.0);
  }
  if (f < 0.5) {
    return mix(c1.rgb, c2.rgb, tex.r < f*4.0 - 1.0 ? 1.0 : 0.0);
  }
  if (f < 0.75) {
    return mix(c2.rgb, c0.rgb, tex.r < f*4.0 - 2.0 ? 1.0 : 0.0);
  }
  return mix(c0.rgb, c1.rgb, tex.r < f*4.0 - 3.0 ? 1.0 : 0.0);
}

void main()
{
  vec3 col = doMagic( interp_texcoord * uvscale.xy + uvscale.zw );

  vec2 circ_uvs = interp_texcoord * uvscale2.xy + uvscale2.zw;
  float dist = length(abs(circ_uvs - 0.5)) * 2.0;
  float h = sqrt(params.z);
  dist = dist - 2.0 + h * 1.8;
  dist = min(ceil(dist * 12.0 * (0.25 + h* 0.5)) * 0.333, 1.0);
  // col.xyz = vec3(dist);
  if (dist > 0.75) {
    col = c0.rgb;
  } else if (dist > 0.5) {
    col = min(col, c1.rgb);
  } else if (dist > 0.25) {
    col = min(col, c2.rgb);
  }

  gl_FragColor = vec4( col, 1.0 );
}
