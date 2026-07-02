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
    this.bgMode = 'yt'; // 'yt' | 'file'
    this.populateDevices();

    // Tabs
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
    const hasVideo = !!this.youtubeId || !!this.localVideoFile;
    btn.disabled = !(hasVideo && this.micDeviceId);
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
        </div>
        <div class="rec-controls">
          <div class="vol-row">
            <label>🎤 Mic <span id="micVolVal">150</span>%</label>
            <input type="range" id="micVol" min="0" max="400" value="150">
          </div>
          <button id="stopBtn" class="btn-stop hidden">⏹ Stop & Preview</button>
        </div>
      </div>
    `;

    if (this.bgMode === 'file') {
      document.getElementById('bgVideo').addEventListener('canplay', () => {
        document.getElementById('bgVideo').play().catch(() => {});
      });
    }

    await this.setupMicCamera();
    this.runCountdown();
  }

  async setupMicCamera() {
    const isPortrait = this.orientation === 'portrait';
    const vW = isPortrait ? 720 : 1280;
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

    document.getElementById('camPreview').srcObject = this.cameraStream;

    // ── Audio graph ──────────────────────────────────────────────────────────
    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    const dest = this.audioCtx.createMediaStreamDestination();

    // Mic chain: preAmp → compressor → micGain → dest
    const micSource = this.audioCtx.createMediaStreamSource(this.cameraStream);
    const preAmp = this.audioCtx.createGain();
    preAmp.gain.value = 3.0;
    const compressor = this.audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 6;
    compressor.ratio.value = 3; compressor.attack.value = 0.001; compressor.release.value = 0.1;
    this.micGain = this.audioCtx.createGain();
    this.micGain.gain.value = 1.5;
    micSource.connect(preAmp); preAmp.connect(compressor);
    compressor.connect(this.micGain); this.micGain.connect(dest);

    this.finalStream = new MediaStream([
      ...this.cameraStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    document.getElementById('micVol').addEventListener('input', e => {
      this.micGain.gain.value = e.target.value / 100;
      document.getElementById('micVolVal').textContent = e.target.value;
    });
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
    document.getElementById('stopBtn').addEventListener('click', () => this.mediaRecorder.stop());
  }

  cleanup() {
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
          <input id="fname" class="fname-input" value="karaoke-recording.webm" />
          <button id="exportBtn" class="btn-export">⬇ Download Video</button>
          <button id="rerecordBtn" class="btn-secondary">🔄 Record Again</button>
        </div>
      </div>
    `;
    document.getElementById('exportBtn').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = document.getElementById('fname').value || 'karaoke-recording.webm';
      a.click();
    });
    document.getElementById('rerecordBtn').addEventListener('click', () => { URL.revokeObjectURL(url); this.render('home'); });
  }
}

const app = new KaraokeApp();
