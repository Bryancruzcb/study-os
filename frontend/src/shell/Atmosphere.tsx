import { useEffect, useRef } from 'react'
import { lightOn, lightSource } from './light'

/* Decorative header field: SVG blobs always, a soft WebGL wash when the GPU and
   motion preference allow it. Colours are read from tokens so the palette stays one
   place. The cursor's light reaches this too: the field leans toward it and takes a
   soft specular from it, from the same light the cards are lit by. Pointer events stay
   off; this is paint, not chrome. */
export default function Atmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    // jsdom implements the canvas element but not a GPU context
    if (typeof navigator !== 'undefined' && /\bjsdom\b/i.test(navigator.userAgent)) return

    let gl: WebGLRenderingContext | null = null
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true })
    } catch {
      return
    }
    if (!gl) return

    const vert = gl.createShader(gl.VERTEX_SHADER)
    const frag = gl.createShader(gl.FRAGMENT_SHADER)
    const program = gl.createProgram()
    if (!vert || !frag || !program) return

    gl.shaderSource(vert, `
      attribute vec2 a;
      void main() { gl_Position = vec4(a, 0.0, 1.0); }
    `)
    gl.shaderSource(frag, `
      precision mediump float;
      uniform vec2 uRes;
      uniform float uTime;
      uniform vec3 uA;
      uniform vec3 uB;
      uniform vec3 uC;
      // where the cursor's light sits in the same units as uv, and how much of it there is
      uniform vec2 uLightAt;
      uniform float uLight;
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        uv.x *= uRes.x / uRes.y;
        vec2 p1 = vec2(0.35 + 0.08 * sin(uTime * 0.21), 0.62 + 0.06 * cos(uTime * 0.17));
        vec2 p2 = vec2(1.05 + 0.07 * cos(uTime * 0.15), 0.38 + 0.08 * sin(uTime * 0.19));
        vec2 p3 = vec2(0.72 + 0.09 * sin(uTime * 0.13), 0.18 + 0.05 * cos(uTime * 0.23));
        // each blob leans a little of the way toward the light, and none of them by the
        // same amount, which is what keeps the lean liquid rather than a slide
        p1 += (uLightAt - p1) * 0.07 * uLight;
        p2 += (uLightAt - p2) * 0.05 * uLight;
        p3 += (uLightAt - p3) * 0.09 * uLight;
        float d1 = 0.28 / (0.12 + dot(uv - p1, uv - p1));
        float d2 = 0.24 / (0.11 + dot(uv - p2, uv - p2));
        float d3 = 0.20 / (0.13 + dot(uv - p3, uv - p3));
        vec3 col = uA * d1 + uB * d2 + uC * d3;
        float a = clamp(d1 + d2 + d3, 0.0, 1.0) * 0.55;
        float fade = smoothstep(0.0, 0.22, uv.y) * (1.0 - smoothstep(0.55, 1.05, gl_FragCoord.y / uRes.y));
        vec2 q = uv - uLightAt;
        float sheen = uLight * exp(-dot(q, q) * 5.0);
        // the shade the same light leaves, mirrored across the middle of the field
        vec2 mid = vec2(0.5 * uRes.x / uRes.y, 0.5);
        vec2 back = uv - (mid + mid - uLightAt);
        float shade = uLight * exp(-dot(back, back) * 4.0);
        // the band's own cyan run up toward white: the same light as the glow under the
        // cards, so the header and the page read as lit from one place
        vec3 tint = mix(vec3(1.0), uA, 0.45);
        vec3 rgb = col / max(d1 + d2 + d3, 0.001) + sheen * tint * 0.3 - shade * 0.06;
        gl_FragColor = vec4(rgb, clamp(a + sheen * 0.34, 0.0, 1.0) * fade);
      }
    `)
    gl.compileShader(vert)
    gl.compileShader(frag)
    if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS) || !gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      return
    }
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'a')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, 'uRes')
    const uTime = gl.getUniformLocation(program, 'uTime')
    const uA = gl.getUniformLocation(program, 'uA')
    const uB = gl.getUniformLocation(program, 'uB')
    const uC = gl.getUniformLocation(program, 'uC')
    const uLightAt = gl.getUniformLocation(program, 'uLightAt')
    const uLight = gl.getUniformLocation(program, 'uLight')

    const rgb = (token: string): [number, number, number] => {
      const probe = document.createElement('span')
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
      document.body.appendChild(probe)
      const raw = getComputedStyle(probe).color
      probe.remove()
      const m = raw.match(/[\d.]+/g)
      if (!m || m.length < 3) return [0.7, 0.85, 1]
      return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255]
    }

    const a = rgb('--blob-0')
    const b = rgb('--blob-1')
    const c = rgb('--blob-2')
    gl.uniform3f(uA, a[0], a[1], a[2])
    gl.uniform3f(uB, b[0], b[1], b[2])
    gl.uniform3f(uC, c[0], c[1], c[2])

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    let frame = 0
    const t0 = performance.now()
    const draw = (now: number) => {
      const parent = canvas.parentElement
      const w = Math.max(1, parent?.clientWidth ?? canvas.clientWidth)
      const h = Math.max(1, parent?.clientHeight ?? canvas.clientHeight)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr)
        canvas.height = Math.floor(h * dpr)
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, (now - t0) / 1000)
      // the light arrives in client coordinates; uv counts up from the bottom of the
      // canvas and measures both axes in its height, so the aspect never distorts it
      const light = lightSource()
      const box = canvas.getBoundingClientRect()
      gl.uniform2f(uLightAt, (light.x - box.left) / h, (box.bottom - light.y) / h)
      // the field is wide, so its light reaches further than a card's before it dies;
      // scrolled past the header, the cursor stops moving the blobs at all
      gl.uniform1f(uLight, lightOn(box, 460))
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      gl.deleteShader(vert)
      gl.deleteShader(frag)
    }
  }, [])

  return (
    <div className="atmosphere" aria-hidden="true">
      <canvas ref={canvasRef} className="atmosphere-gl" />
      <svg className="atmosphere-svg" viewBox="0 0 1200 480" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="blob-blur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="48" />
          </filter>
        </defs>
        <g filter="url(#blob-blur)">
          <circle className="blob blob-0" cx="220" cy="170" r="210" />
          <circle className="blob blob-1" cx="760" cy="90" r="250" />
          <circle className="blob blob-2" cx="1080" cy="210" r="190" />
          <circle className="blob blob-3" cx="520" cy="280" r="160" />
        </g>
      </svg>
    </div>
  )
}
