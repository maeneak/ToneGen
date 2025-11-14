(() => {
    const WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle'];
    const MAX_TONES = 24;
    const MIN_FREQUENCY = 20;
    const MAX_FREQUENCY = 20000;
    const MIN_DURATION_MS = 50;
    const MAX_DURATION_MS = 15000;
    const MAX_TOTAL_DURATION_MS = 60000;
    const DEFAULT_TONE = { frequency: 440, waveform: 'sine', duration: 1000 };
    const REVERB_DEFAULTS = { enabled: true, mix: 0.35, duration: 2.5, decay: 2.5 };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const impulseResponseCache = new Map();

    const toneListEl = document.getElementById('toneList');
    const addToneBtn = document.getElementById('addTone');
    const playButton = document.getElementById('playButton');
    const downloadButton = document.getElementById('downloadButton');
    const statusMessage = document.getElementById('statusMessage');
    const reverbToggle = document.getElementById('reverbToggle');
    const reverbMixInput = document.getElementById('reverbMix');
    const reverbMixValue = document.getElementById('reverbMixValue');

    let activePlaybackContext = null;

    init();

    function init() {
        addToneRow(DEFAULT_TONE);
        addToneBtn.addEventListener('click', handleAddTone);
        playButton.addEventListener('click', handlePlay);
        downloadButton.addEventListener('click', handleDownload);
        if (reverbToggle && reverbMixInput) {
            reverbToggle.addEventListener('change', updateReverbUI);
            reverbMixInput.addEventListener('input', updateReverbUI);
            updateReverbUI();
        }
    }

    function handleAddTone() {
        const toneCount = toneListEl.querySelectorAll('.tone-row').length;
        if (toneCount >= MAX_TONES) {
            showStatus(`Limit of ${MAX_TONES} tones per sequence reached.`, 'error');
            return;
        }

        showStatus('');
        addToneRow(DEFAULT_TONE, { focus: true });
    }

    function handleRemoveTone(row) {
        toneListEl.removeChild(row);
        if (!toneListEl.querySelector('.tone-row')) {
            addToneRow(DEFAULT_TONE);
        }
        showStatus('');
    }

    function handlePlay() {
        const tones = collectToneData();
        if (!tones) {
            return;
        }
        const effects = collectEffectSettings();

        if (!window.AudioContext && !window.webkitAudioContext) {
            showStatus('Web Audio API is not supported in this browser.', 'error');
            return;
        }

        stopActivePlayback();
        playButton.disabled = true;
        showStatus('Playing sample...', 'info');

        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        const context = new AudioContextCtor();
        activePlaybackContext = context;

        // Offset start time slightly to prevent pops on some browsers.
        const startTime = context.currentTime + 0.05;
        let cursor = startTime;
        const masterGain = context.createGain();
        masterGain.gain.setValueAtTime(0.2, cursor);
        if (!applyEffectsChain(context, masterGain, context.destination, effects, startTime)) {
            masterGain.connect(context.destination);
        }

        tones.forEach((tone) => {
            const durationSeconds = tone.duration / 1000;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const start = cursor;
            const stop = start + durationSeconds;
            const ramp = Math.min(0.02, durationSeconds / 4);

            oscillator.type = tone.waveform;
            oscillator.frequency.setValueAtTime(tone.frequency, start);

            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.2, start + ramp);
            gain.gain.setValueAtTime(0.2, stop - ramp);
            gain.gain.linearRampToValueAtTime(0, stop);

            oscillator.connect(gain).connect(masterGain);
            oscillator.start(start);
            oscillator.stop(stop);

            cursor = stop;
        });

        const totalDuration = tones.reduce((acc, tone) => acc + tone.duration, 0);
        const cleanupDelay = totalDuration + 200;

        setTimeout(() => {
            if (activePlaybackContext === context) {
                context.close().catch(() => {});
                activePlaybackContext = null;
            }
            playButton.disabled = false;
            showStatus('Playback complete.', 'success');
        }, cleanupDelay);
    }

    async function handleDownload() {
        const tones = collectToneData();
        if (!tones) {
            return;
        }
        const effects = collectEffectSettings();

        if (!window.OfflineAudioContext && !window.webkitOfflineAudioContext) {
            showStatus('OfflineAudioContext is not supported in this browser.', 'error');
            return;
        }

        downloadButton.disabled = true;
        showStatus('Rendering WAV...', 'info');

        try {
            const blob = await renderSequenceToWav(tones, effects);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'tone-sequence.wav';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            showStatus('WAV file ready.', 'success');
        } catch (error) {
            console.error(error);
            showStatus('Unable to render WAV file. See console for details.', 'error');
        } finally {
            downloadButton.disabled = false;
        }
    }

    function collectToneData() {
        const rows = Array.from(toneListEl.querySelectorAll('.tone-row'));
        if (rows.length === 0) {
            showStatus('Add at least one tone to continue.', 'error');
            return null;
        }

        let totalDuration = 0;
        const tones = [];
        let hasError = false;

        rows.forEach((row) => {
            const frequencyInput = row.querySelector('input[data-field="frequency"]');
            const durationInput = row.querySelector('input[data-field="duration"]');
            const waveformSelect = row.querySelector('select[data-field="waveform"]');

            const rawFrequency = Number(frequencyInput.value);
            const rawDuration = Number(durationInput.value);
            const waveform = waveformSelect.value;

            clearFieldError(frequencyInput);
            clearFieldError(durationInput);
            clearFieldError(waveformSelect);

            if (!Number.isFinite(rawFrequency) || rawFrequency < MIN_FREQUENCY || rawFrequency > MAX_FREQUENCY) {
                setFieldError(frequencyInput, `Frequency must be between ${MIN_FREQUENCY}Hz and ${MAX_FREQUENCY}Hz.`);
                hasError = true;
                return;
            }

            if (!Number.isFinite(rawDuration) || rawDuration < MIN_DURATION_MS || rawDuration > MAX_DURATION_MS) {
                setFieldError(durationInput, `Duration must be between ${MIN_DURATION_MS} and ${MAX_DURATION_MS} ms.`);
                hasError = true;
                return;
            }

            if (!WAVEFORMS.includes(waveform)) {
                hasError = true;
                setFieldError(waveformSelect, 'Select a valid waveform.');
                return;
            }

            totalDuration += rawDuration;
            tones.push({
                frequency: rawFrequency,
                duration: rawDuration,
                waveform
            });
        });

        if (hasError) {
            showStatus('Fix the highlighted fields to continue.', 'error');
            return null;
        }

        if (totalDuration > MAX_TOTAL_DURATION_MS) {
            showStatus(`Total duration exceeds ${(MAX_TOTAL_DURATION_MS / 1000).toFixed(0)} seconds.`, 'error');
            return null;
        }

        showStatus('');
        return tones;
    }

    function collectEffectSettings() {
        if (!reverbToggle || !reverbMixInput) {
            return { reverb: { enabled: false, mix: 0, duration: REVERB_DEFAULTS.duration, decay: REVERB_DEFAULTS.decay } };
        }

        const enabled = Boolean(reverbToggle.checked);
        const rawMix = Number(reverbMixInput.value);
        const mix = enabled ? clamp(rawMix / 100, 0, 1) : 0;

        return {
            reverb: {
                enabled,
                mix,
                duration: REVERB_DEFAULTS.duration,
                decay: REVERB_DEFAULTS.decay
            }
        };
    }

    function addToneRow(tone, options = {}) {
        const row = document.createElement('div');
        row.className = 'tone-row';
        row.innerHTML = `
            <div class="tone-field">
                <label>Frequency (Hz)
                    <input type="number" value="${tone.frequency}" min="${MIN_FREQUENCY}" max="${MAX_FREQUENCY}" data-field="frequency" inputmode="decimal" />
                </label>
            </div>
            <div class="tone-field">
                <label>Waveform
                    <select data-field="waveform">
                        ${WAVEFORMS.map((wf) => `<option value="${wf}" ${wf === tone.waveform ? 'selected' : ''}>${wf}</option>`).join('')}
                    </select>
                </label>
            </div>
            <div class="tone-field">
                <label>Duration (ms)
                    <input type="number" value="${tone.duration}" min="${MIN_DURATION_MS}" max="${MAX_DURATION_MS}" data-field="duration" inputmode="decimal" />
                </label>
            </div>
            <button class="btn btn--secondary" type="button" aria-label="Remove tone">Remove</button>
        `;

        const removeBtn = row.querySelector('button');
        removeBtn.addEventListener('click', () => handleRemoveTone(row));

        toneListEl.appendChild(row);

        if (options.focus) {
            const frequencyInput = row.querySelector('input[data-field="frequency"]');
            frequencyInput?.focus();
            frequencyInput?.select();
        }
    }

    function setFieldError(field, message) {
        field.classList.add('input--error');
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('title', message);
    }

    function clearFieldError(field) {
        field.classList.remove('input--error');
        field.removeAttribute('aria-invalid');
        field.removeAttribute('title');
    }

    function stopActivePlayback() {
        if (activePlaybackContext) {
            activePlaybackContext.close().catch(() => {});
            activePlaybackContext = null;
        }
    }

    function showStatus(message, variant = '') {
        statusMessage.textContent = message;
        statusMessage.classList.remove('status--error', 'status--success');
        if (variant === 'error') {
            statusMessage.classList.add('status--error');
        } else if (variant === 'success') {
            statusMessage.classList.add('status--success');
        }
    }

    async function renderSequenceToWav(tones, effects) {
        const sampleRate = 44100;
        const totalDurationSeconds = tones.reduce((acc, tone) => acc + tone.duration / 1000, 0);
        const safety = 0.05;
        const totalLength = Math.ceil(sampleRate * (totalDurationSeconds + safety));
        const OfflineContextCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const offlineContext = new OfflineContextCtor(1, totalLength, sampleRate);
        const masterGain = offlineContext.createGain();
        masterGain.gain.setValueAtTime(1, 0);
        if (!applyEffectsChain(offlineContext, masterGain, offlineContext.destination, effects, 0)) {
            masterGain.connect(offlineContext.destination);
        }

        let cursor = 0;
        tones.forEach((tone) => {
            const oscillator = offlineContext.createOscillator();
            const gain = offlineContext.createGain();
            const durationSeconds = tone.duration / 1000;
            const start = cursor;
            const stop = start + durationSeconds;
            const ramp = Math.min(0.02, durationSeconds / 4);

            oscillator.type = tone.waveform;
            oscillator.frequency.setValueAtTime(tone.frequency, start);

            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.25, start + ramp);
            gain.gain.setValueAtTime(0.25, stop - ramp);
            gain.gain.linearRampToValueAtTime(0, stop);

            oscillator.connect(gain).connect(masterGain);
            oscillator.start(start);
            oscillator.stop(stop);

            cursor = stop;
        });

        const rendered = await offlineContext.startRendering();
        return audioBufferToWavBlob(rendered, sampleRate);
    }

    function audioBufferToWavBlob(buffer, sampleRate) {
        const channelData = buffer.getChannelData(0);
        const numFrames = channelData.length;
        const bytesPerSample = 2; // 16-bit PCM
        const blockAlign = bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = numFrames * bytesPerSample;
        const bufferSize = 44 + dataSize;

        const arrayBuffer = new ArrayBuffer(bufferSize);
        const view = new DataView(arrayBuffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size
        view.setUint16(20, 1, true); // AudioFormat PCM
        view.setUint16(22, 1, true); // NumChannels
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true); // BitsPerSample
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);
        floatTo16BitPCM(view, 44, channelData);

        return new Blob([new Uint8Array(arrayBuffer)], { type: 'audio/wav' });
    }

    function floatTo16BitPCM(view, offset, input) {
        for (let i = 0; i < input.length; i += 1) {
            const sample = Math.max(-1, Math.min(1, input[i]));
            view.setInt16(offset + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        }
    }

    function writeString(view, offset, str) {
        for (let i = 0; i < str.length; i += 1) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    function updateReverbUI() {
        if (!reverbToggle || !reverbMixInput || !reverbMixValue) {
            return;
        }

        const enabled = Boolean(reverbToggle.checked);
        reverbMixInput.disabled = !enabled;
        const displayValue = enabled ? `${reverbMixInput.value}%` : 'Off';
        reverbMixValue.textContent = displayValue;
    }

    function applyEffectsChain(context, sourceNode, destinationNode, effects, timeOrigin) {
        if (!effects || !effects.reverb || !effects.reverb.enabled || effects.reverb.mix <= 0) {
            sourceNode.connect(destinationNode);
            return true;
        }

        const mix = clamp(effects.reverb.mix, 0, 1);
        const dryGain = context.createGain();
        const wetGain = context.createGain();
        const convolver = context.createConvolver();
        const impulse = getImpulseResponse(context, effects.reverb);

        dryGain.gain.setValueAtTime(1 - mix, timeOrigin);
        wetGain.gain.setValueAtTime(mix, timeOrigin);
        convolver.buffer = impulse;

        sourceNode.connect(dryGain);
        dryGain.connect(destinationNode);

        sourceNode.connect(convolver);
        convolver.connect(wetGain);
        wetGain.connect(destinationNode);

        return true;
    }

    function getImpulseResponse(context, reverbSettings) {
        const duration = clamp(reverbSettings.duration || REVERB_DEFAULTS.duration, 0.1, 10);
        const decay = clamp(reverbSettings.decay || REVERB_DEFAULTS.decay, 0.1, 10);
        const sampleRate = context.sampleRate;
        const key = `${sampleRate}-${duration}-${decay}`;

        if (impulseResponseCache.has(key)) {
            return impulseResponseCache.get(key);
        }

        const length = Math.floor(sampleRate * duration);
        const impulse = context.createBuffer(1, length, sampleRate);
        const data = impulse.getChannelData(0);

        for (let i = 0; i < length; i += 1) {
            const value = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            data[i] = value;
        }

        impulseResponseCache.set(key, impulse);
        return impulse;
    }
})();
