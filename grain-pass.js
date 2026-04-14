class GrainPass {
  constructor() {
    this._canvas = document.createElement("canvas");
    const gl = this._canvas.getContext("webgl");
    if (!gl) { this._supported = false; return; }
    this._gl = gl;
    this._supported = true;
    this._init();
  }

  _init() {
    const gl = this._gl;

    const vs = `
      attribute vec2 aPos;
      varying vec2 vUv;
      void main() {
        vUv = aPos * 0.5 + 0.5;
        vUv.y = 1.0 - vUv.y;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    const fs = `
      precision mediump float;
      uniform sampler2D uTex;
      uniform float uStrength;
      uniform float uSeed;
      varying vec2 vUv;

      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec4 color = texture2D(uTex, vUv);
        float noise = rand(vUv + uSeed) * 2.0 - 1.0;
        color.rgb += noise * uStrength;
        gl_FragColor = clamp(color, 0.0, 1.0);
      }
    `;

    const mkShader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    this._prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
       1, -1,  1,  1, -1,  1,
    ]), gl.STATIC_DRAW);
    this._buf = buf;

    this._tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  // Returns a canvas with grain applied. If strength is 0, returns src unchanged.
  apply(src, strength, seed) {
    if (!this._supported || strength <= 0) return src;

    const gl = this._gl;
    const w = src.width;
    const h = src.height;

    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width = w;
      this._canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    gl.bindTexture(gl.TEXTURE_2D, this._tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

    gl.useProgram(this._prog);

    const aPos = gl.getAttribLocation(this._prog, "aPos");
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1i(gl.getUniformLocation(this._prog, "uTex"), 0);
    gl.uniform1f(gl.getUniformLocation(this._prog, "uStrength"), strength);
    gl.uniform1f(gl.getUniformLocation(this._prog, "uSeed"), seed);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return this._canvas;
  }
}
