(() => {
    const WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle'];
    const MAX_TONES = 24;
    const MIN_FREQUENCY = 20;
    const MAX_FREQUENCY = 20000;
    const MIN_DURATION_MS = 50;
    const MAX_DURATION_MS = 15000;
    const MAX_TOTAL_DURATION_MS = 60000;
    const DEFAULT_TONE = { frequency: 440, waveform: 'sine', duration: 1000 };
    const ENVELOPE_DEFAULTS = {
        enabled: true,
        attack: 0.02,
        minAttack: 0,
        maxAttack: 2,
        decay: 0.12,
        minDecay: 0,
        maxDecay: 2,
        sustain: 0.75,
        minSustain: 0,
        maxSustain: 1,
        release: 0.2,
        minRelease: 0,
        maxRelease: 4
    };
    const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass'];
    const FILTER_DEFAULTS = {
        enabled: false,
        type: 'lowpass',
        frequency: 2000,
        minFrequency: 60,
        maxFrequency: 12000,
        q: 1,
        minQ: 0.1,
        maxQ: 18
    };
    const REVERB_DEFAULTS = { enabled: true, mix: 0.35, duration: 2.5, decay: 2.5 };
    const DELAY_DEFAULTS = { enabled: false, mix: 0.3, time: 0.25, feedback: 0.35, maxTime: 1.5 };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const impulseResponseCache = new Map();

    const toneListEl = document.getElementById('toneList');
    const addToneBtn = document.getElementById('addTone');
    const playButton = document.getElementById('playButton');
    const downloadButton = document.getElementById('downloadButton');
    const statusMessage = document.getElementById('statusMessage');
    const envelopeToggle = document.getElementById('envelopeToggle');
    const envelopeAttackInput = document.getElementById('envelopeAttack');
    const envelopeAttackValue = document.getElementById('envelopeAttackValue');
    const envelopeDecayInput = document.getElementById('envelopeDecay');
    const envelopeDecayValue = document.getElementById('envelopeDecayValue');
    const envelopeSustainInput = document.getElementById('envelopeSustain');
    const envelopeSustainValue = document.getElementById('envelopeSustainValue');
    const envelopeReleaseInput = document.getElementById('envelopeRelease');
    const envelopeReleaseValue = document.getElementById('envelopeReleaseValue');
    const filterToggle = document.getElementById('filterToggle');
    const filterTypeSelect = document.getElementById('filterType');
    const filterFrequencyInput = document.getElementById('filterFrequency');
    const filterFrequencyValue = document.getElementById('filterFrequencyValue');
    const filterQInput = document.getElementById('filterQ');
    const filterQValue = document.getElementById('filterQValue');
    const reverbToggle = document.getElementById('reverbToggle');
    const reverbMixInput = document.getElementById('reverbMix');
    const reverbMixValue = document.getElementById('reverbMixValue');
    const delayToggle = document.getElementById('delayToggle');
    const delayMixInput = document.getElementById('delayMix');
    const delayMixValue = document.getElementById('delayMixValue');
    const delayTimeInput = document.getElementById('delayTime');
    const delayTimeValue = document.getElementById('delayTimeValue');
    const delayFeedbackInput = document.getElementById('delayFeedback');
    const delayFeedbackValue = document.getElementById('delayFeedbackValue');

    let activePlaybackContext = null;

    init();

    function init() {
        addToneRow(DEFAULT_TONE);
        addToneBtn.addEventListener('click', handleAddTone);
        playButton.addEventListener('click', handlePlay);
        downloadButton.addEventListener('click', handleDownload);
        if (envelopeToggle && envelopeAttackInput && envelopeDecayInput && envelopeSustainInput && envelopeReleaseInput) {
            envelopeToggle.addEventListener('change', updateEnvelopeUI);
            envelopeAttackInput.addEventListener('input', updateEnvelopeUI);
            envelopeDecayInput.addEventListener('input', updateEnvelopeUI);
            envelopeSustainInput.addEventListener('input', updateEnvelopeUI);
            envelopeReleaseInput.addEventListener('input', updateEnvelopeUI);
            updateEnvelopeUI();
        }
        if (filterToggle && filterTypeSelect && filterFrequencyInput && filterQInput) {
            filterToggle.addEventListener('change', updateFilterUI);
            filterTypeSelect.addEventListener('change', updateFilterUI);
            filterFrequencyInput.addEventListener('input', updateFilterUI);
            filterQInput.addEventListener('input', updateFilterUI);
            updateFilterUI();
        }
        if (reverbToggle && reverbMixInput) {
            reverbToggle.addEventListener('change', updateReverbUI);
            reverbMixInput.addEventListener('input', updateReverbUI);
            updateReverbUI();
        }
        if (delayToggle && delayMixInput && delayTimeInput && delayFeedbackInput) {
            delayToggle.addEventListener('change', updateDelayUI);
            delayMixInput.addEventListener('input', updateDelayUI);
            delayTimeInput.addEventListener('input', updateDelayUI);
            delayFeedbackInput.addEventListener('input', updateDelayUI);
            updateDelayUI();
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

            oscillator.type = tone.waveform;
            oscillator.frequency.setValueAtTime(tone.frequency, start);

            applyAmplitudeEnvelope(gain, start, stop, effects.envelope);

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
        const envelopeEnabled = envelopeToggle ? Boolean(envelopeToggle.checked) : ENVELOPE_DEFAULTS.enabled;
        const envelopeAttackMs = envelopeAttackInput ? Number(envelopeAttackInput.value) : ENVELOPE_DEFAULTS.attack * 1000;
        const envelopeDecayMs = envelopeDecayInput ? Number(envelopeDecayInput.value) : ENVELOPE_DEFAULTS.decay * 1000;
        const envelopeSustainRaw = envelopeSustainInput ? Number(envelopeSustainInput.value) : ENVELOPE_DEFAULTS.sustain * 100;
        const envelopeReleaseMs = envelopeReleaseInput ? Number(envelopeReleaseInput.value) : ENVELOPE_DEFAULTS.release * 1000;

        const envelopeAttack = clamp(envelopeAttackMs / 1000, ENVELOPE_DEFAULTS.minAttack, ENVELOPE_DEFAULTS.maxAttack);
        const envelopeDecay = clamp(envelopeDecayMs / 1000, ENVELOPE_DEFAULTS.minDecay, ENVELOPE_DEFAULTS.maxDecay);
        const envelopeSustain = clamp(envelopeSustainRaw / 100, ENVELOPE_DEFAULTS.minSustain, ENVELOPE_DEFAULTS.maxSustain);
        const envelopeRelease = clamp(envelopeReleaseMs / 1000, ENVELOPE_DEFAULTS.minRelease, ENVELOPE_DEFAULTS.maxRelease);

        const filterEnabled = filterToggle ? Boolean(filterToggle.checked) : FILTER_DEFAULTS.enabled;
        const filterTypeRaw = filterTypeSelect ? filterTypeSelect.value : FILTER_DEFAULTS.type;
        const filterFrequencyRaw = filterFrequencyInput ? Number(filterFrequencyInput.value) : FILTER_DEFAULTS.frequency;
        const filterQRaw = filterQInput ? Number(filterQInput.value) : FILTER_DEFAULTS.q;

        const filterType = FILTER_TYPES.includes(filterTypeRaw) ? filterTypeRaw : FILTER_DEFAULTS.type;
        const filterFrequency = clamp(filterFrequencyRaw, FILTER_DEFAULTS.minFrequency, FILTER_DEFAULTS.maxFrequency);
        const filterQ = clamp(filterQRaw, FILTER_DEFAULTS.minQ, FILTER_DEFAULTS.maxQ);

        const reverbEnabled = reverbToggle ? Boolean(reverbToggle.checked) : REVERB_DEFAULTS.enabled;
        const reverbSlider = reverbMixInput ? Number(reverbMixInput.value) : Math.round(REVERB_DEFAULTS.mix * 100);
        const reverbMix = reverbEnabled ? clamp(reverbSlider / 100, 0, 1) : 0;

        const delayEnabled = delayToggle ? Boolean(delayToggle.checked) : DELAY_DEFAULTS.enabled;
        const delayMixSlider = delayMixInput ? Number(delayMixInput.value) : Math.round(DELAY_DEFAULTS.mix * 100);
        const delayTimeSlider = delayTimeInput ? Number(delayTimeInput.value) : Math.round(DELAY_DEFAULTS.time * 1000);
        const delayFeedbackSlider = delayFeedbackInput ? Number(delayFeedbackInput.value) : Math.round(DELAY_DEFAULTS.feedback * 100);

        const delayMix = delayEnabled ? clamp(delayMixSlider / 100, 0, 1) : 0;
        const delayTime = clamp(delayTimeSlider / 1000, 0.01, DELAY_DEFAULTS.maxTime);
        const delayFeedback = delayEnabled ? clamp(delayFeedbackSlider / 100, 0, 0.95) : 0;

        return {
            envelope: {
                enabled: envelopeEnabled,
                attack: envelopeAttack,
                decay: envelopeDecay,
                sustain: envelopeSustain,
                release: envelopeRelease
            },
            filter: {
                enabled: filterEnabled,
                type: filterType,
                frequency: filterFrequency,
                q: filterQ
            },
            reverb: {
                enabled: reverbEnabled,
                mix: reverbMix,
                duration: REVERB_DEFAULTS.duration,
                decay: REVERB_DEFAULTS.decay
            },
            delay: {
                enabled: delayEnabled,
                mix: delayMix,
                time: delayTime,
                feedback: delayFeedback,
                maxTime: DELAY_DEFAULTS.maxTime
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

            oscillator.type = tone.waveform;
            oscillator.frequency.setValueAtTime(tone.frequency, start);

            applyAmplitudeEnvelope(gain, start, stop, effects.envelope);

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

    function formatMilliseconds(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return '';
        }

        if (numeric >= 1000) {
            const seconds = numeric / 1000;
            const precision = seconds >= 2 ? 1 : 2;
            return `${seconds.toFixed(precision)} s`;
        }

        return `${Math.round(numeric)} ms`;
    }

    function formatPercent(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return '';
        }

        return `${numeric.toFixed(0)}%`;
    }

    function formatFrequency(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return '';
        }

        if (numeric >= 1000) {
            const precision = numeric >= 10000 ? 1 : 2;
            return `${(numeric / 1000).toFixed(precision)} kHz`;
        }

        return `${Math.round(numeric)} Hz`;
    }

    function formatQ(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return '';
        }

        return numeric.toFixed(1);
    }

    function updateEnvelopeUI() {
        if (!envelopeToggle || !envelopeAttackInput || !envelopeDecayInput || !envelopeSustainInput || !envelopeReleaseInput || !envelopeAttackValue || !envelopeDecayValue || !envelopeSustainValue || !envelopeReleaseValue) {
            return;
        }

        const enabled = Boolean(envelopeToggle.checked);
        envelopeAttackInput.disabled = !enabled;
        envelopeDecayInput.disabled = !enabled;
        envelopeSustainInput.disabled = !enabled;
        envelopeReleaseInput.disabled = !enabled;

        envelopeAttackValue.textContent = enabled ? formatMilliseconds(envelopeAttackInput.value) : 'Off';
        envelopeDecayValue.textContent = enabled ? formatMilliseconds(envelopeDecayInput.value) : 'Off';
        envelopeSustainValue.textContent = enabled ? formatPercent(envelopeSustainInput.value) : 'Off';
        envelopeReleaseValue.textContent = enabled ? formatMilliseconds(envelopeReleaseInput.value) : 'Off';
    }

    function updateFilterUI() {
        if (!filterToggle || !filterTypeSelect || !filterFrequencyInput || !filterFrequencyValue || !filterQInput || !filterQValue) {
            return;
        }

        const enabled = Boolean(filterToggle.checked);
        filterTypeSelect.disabled = !enabled;
        filterFrequencyInput.disabled = !enabled;
        filterQInput.disabled = !enabled;

        filterFrequencyValue.textContent = enabled ? formatFrequency(filterFrequencyInput.value) : 'Off';
        filterQValue.textContent = enabled ? formatQ(filterQInput.value) : 'Off';
    }

    function updateReverbUI() {
        if (!reverbToggle || !reverbMixInput || !reverbMixValue) {
            return;
        }

        const enabled = Boolean(reverbToggle.checked);
        reverbMixInput.disabled = !enabled;
        reverbMixValue.textContent = enabled ? `${reverbMixInput.value}%` : 'Off';
    }

    function updateDelayUI() {
        if (!delayToggle || !delayMixInput || !delayTimeInput || !delayFeedbackInput || !delayMixValue || !delayTimeValue || !delayFeedbackValue) {
            return;
        }

        const enabled = Boolean(delayToggle.checked);
        delayMixInput.disabled = !enabled;
        delayTimeInput.disabled = !enabled;
        delayFeedbackInput.disabled = !enabled;

        delayMixValue.textContent = enabled ? `${delayMixInput.value}%` : 'Off';
        delayTimeValue.textContent = enabled ? `${delayTimeInput.value} ms` : 'Off';
        delayFeedbackValue.textContent = enabled ? `${delayFeedbackInput.value}%` : 'Off';
    }

    function applyAmplitudeEnvelope(gainNode, startTime, stopTime, envelope) {
        const duration = Math.max(0, stopTime - startTime);
        const gainParam = gainNode.gain;
        gainParam.cancelScheduledValues(startTime);
        gainParam.setValueAtTime(0, startTime);

        if (!envelope || !envelope.enabled || duration === 0) {
            const ramp = Math.max(Math.min(0.02, duration / 4 || 0.005), 0.0025);
            const sustainEnd = Math.max(startTime, stopTime - ramp);
            gainParam.linearRampToValueAtTime(1, startTime + ramp);
            gainParam.setValueAtTime(1, sustainEnd);
            gainParam.linearRampToValueAtTime(0, stopTime);
            return;
        }

        const attack = clamp(envelope.attack ?? ENVELOPE_DEFAULTS.attack, ENVELOPE_DEFAULTS.minAttack, ENVELOPE_DEFAULTS.maxAttack);
        const decay = clamp(envelope.decay ?? ENVELOPE_DEFAULTS.decay, ENVELOPE_DEFAULTS.minDecay, ENVELOPE_DEFAULTS.maxDecay);
        const sustainLevel = clamp(envelope.sustain ?? ENVELOPE_DEFAULTS.sustain, ENVELOPE_DEFAULTS.minSustain, ENVELOPE_DEFAULTS.maxSustain);
        const release = clamp(envelope.release ?? ENVELOPE_DEFAULTS.release, ENVELOPE_DEFAULTS.minRelease, ENVELOPE_DEFAULTS.maxRelease);

        const releaseTime = Math.min(release, duration);
        let remaining = Math.max(0, duration - releaseTime);

        const attackTime = Math.min(attack, remaining);
        remaining -= attackTime;

        const decayTime = Math.min(decay, remaining);
        remaining -= decayTime;

        const sustainTime = Math.max(0, remaining);

        const attackEnd = startTime + attackTime;
        const decayEnd = attackEnd + decayTime;
        const releaseStart = decayEnd + sustainTime;

        if (attackTime > 0) {
            gainParam.linearRampToValueAtTime(1, attackEnd);
        } else {
            gainParam.setValueAtTime(1, startTime);
        }

        if (decayTime > 0) {
            gainParam.linearRampToValueAtTime(sustainLevel, decayEnd);
        } else {
            gainParam.setValueAtTime(sustainLevel, attackEnd);
        }

        gainParam.setValueAtTime(sustainLevel, releaseStart);

        if (releaseTime > 0) {
            gainParam.linearRampToValueAtTime(0, stopTime);
        } else {
            gainParam.setValueAtTime(0, stopTime);
        }
    }

    function applyEffectsChain(context, sourceNode, destinationNode, effects, timeOrigin) {
        const filterSettings = effects?.filter ?? {};
        const reverbSettings = effects?.reverb ?? {};
        const delaySettings = effects?.delay ?? {};

        let branchSource = sourceNode;
        if (Boolean(filterSettings.enabled)) {
            const filterType = FILTER_TYPES.includes(filterSettings.type) ? filterSettings.type : FILTER_DEFAULTS.type;
            const filterFrequency = clamp(filterSettings.frequency ?? FILTER_DEFAULTS.frequency, FILTER_DEFAULTS.minFrequency, FILTER_DEFAULTS.maxFrequency);
            const filterQ = clamp(filterSettings.q ?? FILTER_DEFAULTS.q, FILTER_DEFAULTS.minQ, FILTER_DEFAULTS.maxQ);

            const filter = context.createBiquadFilter();
            filter.type = filterType;
            filter.frequency.setValueAtTime(filterFrequency, timeOrigin);
            filter.Q.setValueAtTime(filterQ, timeOrigin);

            sourceNode.connect(filter);
            branchSource = filter;
        }

        const reverbEnabled = Boolean(reverbSettings.enabled) && reverbSettings.mix > 0;
        const delayEnabled = Boolean(delaySettings.enabled) && delaySettings.mix > 0;

        const reverbMix = reverbEnabled ? clamp(reverbSettings.mix, 0, 1) : 0;
        const delayMix = delayEnabled ? clamp(delaySettings.mix, 0, 1) : 0;

        const dryGain = context.createGain();
        if (reverbMix > 0 || delayMix > 0) {
            const combined = Math.min(0.9, reverbMix + delayMix * 0.6);
            const dryLevel = clamp(1 - combined, 0.05, 1);
            dryGain.gain.setValueAtTime(dryLevel, timeOrigin);
        } else {
            dryGain.gain.setValueAtTime(1, timeOrigin);
        }

        branchSource.connect(dryGain);
        dryGain.connect(destinationNode);

        if (delayMix > 0) {
            const maxDelayTime = clamp(delaySettings.maxTime || DELAY_DEFAULTS.maxTime, 0.1, 5);
            const delayNode = context.createDelay(maxDelayTime);
            const delayTime = clamp(delaySettings.time || DELAY_DEFAULTS.time, 0.01, maxDelayTime);
            const feedbackAmount = clamp(delaySettings.feedback ?? DELAY_DEFAULTS.feedback, 0, 0.95);

            delayNode.delayTime.setValueAtTime(delayTime, timeOrigin);

            const feedbackGain = context.createGain();
            feedbackGain.gain.setValueAtTime(feedbackAmount, timeOrigin);

            const delayWet = context.createGain();
            delayWet.gain.setValueAtTime(delayMix, timeOrigin);

            branchSource.connect(delayNode);
            delayNode.connect(delayWet);
            delayWet.connect(destinationNode);

            delayNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);
        }

        if (reverbMix > 0) {
            const convolver = context.createConvolver();
            convolver.buffer = getImpulseResponse(context, reverbSettings);
            const reverbWet = context.createGain();
            reverbWet.gain.setValueAtTime(reverbMix, timeOrigin);

            branchSource.connect(convolver);
            convolver.connect(reverbWet);
            reverbWet.connect(destinationNode);
        }

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
