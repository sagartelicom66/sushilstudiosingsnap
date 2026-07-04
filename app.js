class KaraokeApp {
  constructor() {
    this.youtubeId = null;
    this.localVideoFile = null;
    this.micDeviceId = null;
    this.cameraDeviceId = null;
    this.orientation = 'portrait';
    this.cameraStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.audioCtx = null;
    this.camZoom = 1;
    this.camBright = 1;
    this.camWarmth = 0;
    this.rafId = null;
    this.render('home');
  }

  render(screen, data = {}) {
    this.currentScreen = screen;
    const app = document.getElementById('app');
    if (screen === 'home')      { app.innerHTML = this.homeHTML(); this.bindHome(); }
    if (screen === 'recording') this.startRecordingScreen();
    if (screen === 'preview')   this.previewScreen(data.blob);
  }

  // ─── HOME ────────────────────────────────────────────────────────────────────

  homeHTML() {
    return `
      <div class="home">
        <div class="logo">🎤 Sushil Studio SingSnap</div>
        <p class="tagline">Pick your background, choose your devices, and sing!</p>

        <div class="card">
          <label>🎬 Background Video</label>
          <div class="tab-row">
            <button class="tab-btn active" id="tabYt">YouTube</button>
            <button class="tab-btn" id="tabFile">Upload File</button>
          </div>
          <div id="panelYt">
            <input id="ytUrl" type="text" placeholder="https://www.youtube.com/watch?v=..." />
            <div id="ytPreview" class="yt-preview hidden"></div>
          </div>
          <div id="panelFile" class="hidden">
            <label class="file-drop" id="fileDrop">
              <span id="fileLabel">📁 Click or drag a video file here (MP4, WebM, MOV)</span>
              <input type="file" id="videoFile" accept="video/*" style="display:none">
            </label>
          </div>
        </div>

        <div class="card">
          <label>🎤 Microphone</label>
          <select id="micSelect"><option value="">Loading…</option></select>
          <div class="mic-hint">Use headphones for best results — keeps background music out of your mic.</div>
        </div>

        <div class="card">
          <label>📷 Camera</label>
          <select id="camSelect"><option value="">Loading…</option></select>
          <div class="orient-row">
            <span class="orient-label">Orientation</span>
            <div class="orient-btns">
              <button class="orient-btn active" id="btnPortrait">📱 Portrait 9:16</button>
              <button class="orient-btn" id="btnLandscape">⬛ Landscape 16:9</button>
            </div>
          </div>
        </div>

        <button id="startBtn" class="btn-start" disabled>🎙️ Start Recording</button>
      </div>
    `;
  }

  bindHome() {
    this.bgMode = 'yt';
    this.populateDevices();

    const tabs = { tabYt: 'yt', tabFile: 'file' };
    const panels = { yt: 'panelYt', file: 'panelFile' };
    Object.entries(tabs).forEach(([btnId, mode]) => {
      document.getElementById(btnId).addEventListener('click', () => {
        Object.keys(tabs).forEach(id => document.getElementById(id).classList.remove('active'));
        document.getElementById(btnId).classList.add('active');
        Object.values(panels).forEach(p => document.getElementById(p).classList.add('hidden'));
        document.getElementById(panels[mode]).classList.remove('hidden');
        this.bgMode = mode;
        this.youtubeId = null;
        this.localVideoFile = null;
        this.checkReady();
      });
    });

    document.getElementById('ytUrl').addEventListener('input', e => this.handleYtInput(e.target.value.trim()));

    const fileInput = document.getElementById('videoFile');
    const fileDrop  = document.getElementById('fileDrop');
    fileDrop.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => this.handleVideoFile(e.target.files[0]));
    fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('dragover'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
    fileDrop.addEventListener('drop', e => {
      e.preventDefault(); fileDrop.classList.remove('dragover');
      this.handleVideoFile(e.dataTransfer.files[0]);
    });

    document.getElementById('micSelect').addEventListener('change', e => { this.micDeviceId = e.target.value; this.checkReady(); });
    document.getElementById('camSelect').addEventListener('change', e => { this.cameraDeviceId = e.target.value; });

    document.getElementById('btnPortrait').addEventListener('click', () => {
      this.orientation = 'portrait';
      document.getElementById('btnPortrait').classList.add('active');
      document.getElementById('btnLandscape').classList.remove('active');
    });
    document.getElementById('btnLandscape').addEventListener('click', () => {
      this.orientation = 'landscape';
      document.getElementById('btnLandscape').classList.add('active');
      document.getElementById('btnPortrait').classList.remove('active');
    });

    document.getElementById('startBtn').addEventListener('click', () => this.render('recording'));
  }

  async populateDevices() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      s.getTracks().forEach(t => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      const cams = devices.filter(d => d.kind === 'videoinput');
      document.getElementById('micSelect').innerHTML = mics.map((d,i) => `<option value="${d.deviceId}">${d.label||'Mic '+(i+1)}</option>`).join('');
      document.getElementById('camSelect').innerHTML = cams.map((d,i) => `<option value="${d.deviceId}">${d.label||'Camera '+(i+1)}</option>`).join('');
      this.micDeviceId    = mics[0]?.deviceId || null;
      this.cameraDeviceId = cams[0]?.deviceId || null;
      this.checkReady();
    } catch {
      document.getElementById('micSelect').innerHTML = '<option value="default">Default Microphone</option>';
      document.getElementById('camSelect').innerHTML  = '<option value="default">Default Camera</option>';
      this.micDeviceId = this.cameraDeviceId = 'default';
      this.checkReady();
    }
  }

  handleYtInput(url) {
    const id = this.extractYtId(url);
    this.youtubeId = id;
    const preview = document.getElementById('ytPreview');
    if (id) {
      preview.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=0&controls=1" allowfullscreen></iframe>`;
      preview.classList.remove('hidden');
    } else {
      preview.innerHTML = '';
      preview.classList.add('hidden');
    }
    this.checkReady();
  }

  handleVideoFile(file) {
    if (!file || !file.type.startsWith('video/')) return;
    this.localVideoFile = file;
    document.getElementById('fileLabel').textContent = `✅ ${file.name}`;
    this.checkReady();
  }

  extractYtId(url) {
    const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  checkReady() {
    const btn = document.getElementById('startBtn');
    if (!btn) return;
    btn.disabled = !((this.youtubeId || this.localVideoFile) && this.micDeviceId);
  }

  // ─── RECORDING ───────────────────────────────────────────────────────────────

  async startRecordingScreen() {
    const isPortrait = this.orientation === 'portrait';

    document.getElementById('app').innerHTML = `
      <div class="rec-screen">
        <div class="yt-area" id="bgArea">
          ${this.bgMode === 'file'
            ? `<video id="bgVideo" class="bg-video" src="${URL.createObjectURL(this.localVideoFile)}" controls playsinline></video>`
            : `<iframe class="yt-iframe" src="https://www.youtube.com/embed/${this.youtubeId}?autoplay=1&controls=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
          }
        </div>
        <div class="cam-area${isPortrait ? ' portrait-mode' : ''}">
          <video id="camPreview" autoplay muted playsinline></video>
          <div id="countdown" class="countdown hidden"></div>
          <div id="recBadge" class="rec-badge hidden">● REC</div>
          <div class="cam-overlay">
            <div class="overlay-sliders">
              <div class="ov-row">
                <span>🎤</span>
                <input type="range" id="micVol" min="0" max="400" value="150">
                <span id="micVolVal">150</span>%
              </div>
              ${this.bgMode === 'file' ? `
              <div class="ov-row">
                <span>🎵</span>
                <input type="range" id="songVol" min="0" max="200" value="100">
                <span id="songVolVal">100</span>%
              </div>` : ''}
              <div class="ov-row">
                <span>🔍</span>
                <input type="range" id="zoomSlider" min="50" max="300" value="100">
                <span id="zoomVal">0.0</span>x
              </div>
              <div class="ov-row">
                <span>☀️</span>
                <input type="range" id="brightSlider" min="50" max="200" value="100">
                <span id="brightVal">100</span>%
              </div>
              <div class="ov-row">
                <span>🌡️</span>
                <input type="range" id="warmthSlider" min="0" max="100" value="0">
                <span id="warmthVal">0</span>%
              </div>
            </div>
            <button id="stopBtn" class="btn-stop hidden">⏹ Stop & Preview</button>
          </div>
        </div>
      </div>
    `;

    if (this.bgMode === 'file') {
      const bgVid = document.getElementById('bgVideo');
      bgVid.addEventListener('canplay', () => bgVid.play().catch(() => {}));
    }

    await this.setupMicCamera();
    this.runCountdown();
  }

  updateCamFilter() {
    const vid = document.getElementById('camPreview');
    if (!vid) return;
    vid.style.transform = `scaleX(-1) scale(${this.camZoom})`;
    vid.style.filter    = `brightness(${this.camBright}) sepia(${this.camWarmth})`;
  }

  async setupMicCamera() {
    const isPortrait = this.orientation === 'portrait';
    const vW = isPortrait ? 720  : 1280;
    const vH = isPortrait ? 1280 : 720;
    const camId = this.cameraDeviceId && this.cameraDeviceId !== 'default' ? { exact: this.cameraDeviceId } : undefined;

    const audioConstraints = {
      deviceId: this.micDeviceId && this.micDeviceId !== 'default' ? { exact: this.micDeviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: 48000,
      channelCount: 1
    };

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: camId, width: { ideal: vW }, height: { ideal: vH }, frameRate: { ideal: 30 } },
        audio: audioConstraints
      });
    } catch {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: vW }, height: { ideal: vH } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 }
      });
    }

    const vid = document.getElementById('camPreview');
    vid.srcObject = this.cameraStream;

    // ── Audio graph ──────────────────────────────────────────────────────────
    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    const dest = this.audioCtx.createMediaStreamDestination();

    const micSource  = this.audioCtx.createMediaStreamSource(this.cameraStream);
    const preAmp     = this.audioCtx.createGain();
    preAmp.gain.value = 3.0;
    const compressor = this.audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 6;
    compressor.ratio.value = 3; compressor.attack.value = 0.001; compressor.release.value = 0.1;
    this.micGain = this.audioCtx.createGain();
    this.micGain.gain.value = 1.5;
    micSource.connect(preAmp);
    preAmp.connect(compressor);
    compressor.connect(this.micGain);
    this.micGain.connect(dest);

    // Song audio (local file only)
    if (this.bgMode === 'file') {
      const bgVid = document.getElementById('bgVideo');
      const songSource = this.audioCtx.createMediaElementSource(bgVid);
      this.songGain = this.audioCtx.createGain();
      this.songGain.gain.value = 1.0;
      songSource.connect(this.songGain);
      this.songGain.connect(dest);
      // Also connect to speakers so user hears it
      this.songGain.connect(this.audioCtx.destination);

      document.getElementById('songVol').addEventListener('input', e => {
        this.songGain.gain.value = e.target.value / 100;
        document.getElementById('songVolVal').textContent = e.target.value;
      });
    }

    // ── Canvas for video recording ───────────────────────────────────────────
    const cW = vW, cH = vH;
    const canvas = document.createElement('canvas');
    canvas.width  = cW;
    canvas.height = cH;
    const ctx2d = canvas.getContext('2d');

    // Continuous draw loop — runs always, not gated on recording state
    const drawLoop = () => {
      this.rafId = requestAnimationFrame(drawLoop);
      if (vid.readyState < 2) return;
      const z = this.camZoom;
      const vw = vid.videoWidth  || cW;
      const vh = vid.videoHeight || cH;
      // Fit video into canvas maintaining aspect ratio (like object-fit: cover)
      const scale = Math.max(cW / vw, cH / vh) * z;
      const dW = vw * scale;
      const dH = vh * scale;
      const dx = (cW - dW) / 2;
      const dy = (cH - dH) / 2;
      ctx2d.clearRect(0, 0, cW, cH);
      ctx2d.save();
      ctx2d.filter = `brightness(${this.camBright}) sepia(${this.camWarmth})`;
      // Mirror horizontally around canvas center
      ctx2d.translate(cW, 0);
      ctx2d.scale(-1, 1);
      ctx2d.drawImage(vid, dx, dy, dW, dH);
      ctx2d.restore();
    };
    drawLoop();

    const canvasStream = canvas.captureStream(30);
    this.finalStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    // ── Controls ─────────────────────────────────────────────────────────────
    document.getElementById('micVol').addEventListener('input', e => {
      this.micGain.gain.value = e.target.value / 100;
      document.getElementById('micVolVal').textContent = e.target.value;
    });

    this.camZoom = 1; this.camBright = 1; this.camWarmth = 0;

    document.getElementById('zoomSlider').addEventListener('input', e => {
      this.camZoom = e.target.value / 100;
      const d = (this.camZoom - 1).toFixed(1);
      document.getElementById('zoomVal').textContent = (d > 0 ? '+' : '') + d;
      this.updateCamFilter();
    });
    document.getElementById('brightSlider').addEventListener('input', e => {
      this.camBright = e.target.value / 100;
      document.getElementById('brightVal').textContent = e.target.value;
      this.updateCamFilter();
    });
    document.getElementById('warmthSlider').addEventListener('input', e => {
      this.camWarmth = e.target.value / 100;
      document.getElementById('warmthVal').textContent = e.target.value;
      this.updateCamFilter();
    });

    this.updateCamFilter();
  }

  runCountdown() {
    const el = document.getElementById('countdown');
    el.classList.remove('hidden');
    let n = 3;
    el.textContent = n;
    const tick = setInterval(() => {
      n--;
      if (n > 0) {
        el.textContent = n;
      } else {
        el.textContent = 'GO!';
        clearInterval(tick);
        setTimeout(() => { el.classList.add('hidden'); this.beginRecording(); }, 700);
      }
    }, 1000);
  }

  beginRecording() {
    document.getElementById('recBadge').classList.remove('hidden');
    document.getElementById('stopBtn').classList.remove('hidden');

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus' : 'video/webm';

    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(this.finalStream, {
      mimeType,
      videoBitsPerSecond: 5_000_000,
      audioBitsPerSecond: 320_000
    });
    this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      this.cleanup();
      this.render('preview', { blob });
    };
    this.mediaRecorder.start(100);

    document.getElementById('stopBtn').addEventListener('click', () => {
      this.mediaRecorder.requestData();
      setTimeout(() => this.mediaRecorder.stop(), 300);
    });
  }

  cleanup() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.cameraStream?.getTracks().forEach(t => t.stop());
    this.audioCtx?.close();
  }

  // ─── PREVIEW ─────────────────────────────────────────────────────────────────

  previewScreen(blob) {
    const url = URL.createObjectURL(blob);
    const isPortrait = this.orientation === 'portrait';
    document.getElementById('app').innerHTML = `
      <div class="preview-screen">
        <div class="logo">🎤 Sushil Studio SingSnap</div>
        <h2>Preview Your Recording</h2>
        <video src="${url}" controls playsinline class="preview-video${isPortrait ? ' preview-portrait' : ''}"></video>
        <div class="preview-actions">
          <input id="fname" class="fname-input" value="karaoke" />
          <div class="export-btns">
            <button id="exportMp4" class="btn-export">🎬 Export MP4 (Video)</button>
            <button id="exportMp3" class="btn-export btn-export-mp3">🎵 Export MP3 (Audio)</button>
          </div>
          <div id="convertStatus" class="convert-status hidden"></div>
          <button id="rerecordBtn" class="btn-secondary">🔄 Record Again</button>
        </div>
      </div>
    `;

    document.getElementById('exportMp4').addEventListener('click', () => this.convertAndDownload(blob, 'mp4'));
    document.getElementById('exportMp3').addEventListener('click', () => this.convertAndDownload(blob, 'mp3'));
    document.getElementById('rerecordBtn').addEventListener('click', () => { URL.revokeObjectURL(url); this.render('home'); });
  }

  async convertAndDownload(blob, format) {
    const status = document.getElementById('convertStatus');
    status.classList.remove('hidden');
    status.textContent = `⏳ Converting to ${format.toUpperCase()}… please wait`;
    document.getElementById('exportMp4').disabled = true;
    document.getElementById('exportMp3').disabled = true;

    try {
      const { FFmpeg } = FFmpegWASM;
      const { fetchFile } = FFmpegUtil;

      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd/ffmpeg-core.js'
      });

      ffmpeg.on('progress', ({ progress }) => {
        status.textContent = `⏳ Converting… ${Math.round(progress * 100)}%`;
      });

      const inputData = await fetchFile(blob);
      await ffmpeg.writeFile('input.webm', inputData);

      const fname = document.getElementById('fname').value || 'karaoke';

      if (format === 'mp4') {
        await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', 'output.mp4']);
        const data = await ffmpeg.readFile('output.mp4');
        this.triggerDownload(new Blob([data.buffer], { type: 'video/mp4' }), `${fname}.mp4`);
      } else {
        await ffmpeg.exec(['-i', 'input.webm', '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', '-q:a', '0', 'output.mp3']);
        const data = await ffmpeg.readFile('output.mp3');
        this.triggerDownload(new Blob([data.buffer], { type: 'audio/mpeg' }), `${fname}.mp3`);
      }

      status.textContent = `✅ Done! File downloaded.`;
    } catch (err) {
      status.textContent = `❌ Conversion failed: ${err.message}`;
    } finally {
      document.getElementById('exportMp4').disabled = false;
      document.getElementById('exportMp3').disabled = false;
    }
  }

  triggerDownload(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }
}

const app = new KaraokeApp();
