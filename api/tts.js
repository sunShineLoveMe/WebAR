const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { EdgeTTS } = require('node-edge-tts');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const text = String(body.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Missing text' });
  }

  const clippedText = text.slice(0, 600);
  const voice = (process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural').trim();
  const lang = (process.env.TTS_LANG || 'zh-CN').trim();
  const rate = (process.env.TTS_RATE || '+0%').trim();
  const pitch = (process.env.TTS_PITCH || '+0Hz').trim();
  const volume = (process.env.TTS_VOLUME || '+0%').trim();
  const outputFormat = (process.env.TTS_OUTPUT_FORMAT || 'audio-24khz-48kbitrate-mono-mp3').trim();
  const tempFile = path.join(os.tmpdir(), `hu-xiaobao-${randomUUID()}.mp3`);

  try {
    const tts = new EdgeTTS({
      voice,
      lang,
      rate,
      pitch,
      volume,
      outputFormat,
      timeout: 20000
    });

    await tts.ttsPromise(clippedText, tempFile);
    const audio = await fs.readFile(tempFile);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-TTS-Voice', voice);
    return res.status(200).send(audio);
  } catch (error) {
    return res.status(500).json({
      error: 'TTS synthesis failed',
      details: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
};
