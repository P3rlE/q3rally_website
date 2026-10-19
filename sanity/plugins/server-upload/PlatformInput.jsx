import { useState, useRef } from 'react';
import { set } from 'sanity';
import { Box, Button, Card, Flex, Stack, Text } from '@sanity/ui';
import { UploadIcon, CheckmarkCircleIcon, ErrorOutlineIcon } from '@sanity/icons';

const UPLOAD_URL   = 'https://www.q3rally.com/upload/upload.php';
const UPLOAD_TOKEN = import.meta.env.SANITY_STUDIO_UPLOAD_TOKEN ?? '';
const CHUNK_SIZE   = 2 * 1024 * 1024; // 2 MB pro Chunk
const MAX_RETRIES  = 3;

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Einzelnen Chunk hochladen — gibt Promise<Response-JSON> zurück
function uploadChunk(chunk, chunkIndex, totalChunks, filename, sessionId, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file',          chunk);
    formData.append('chunk_index',   chunkIndex);
    formData.append('total_chunks',  totalChunks);
    formData.append('filename',      filename);
    formData.append('session_id',    sessionId);

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Ungültige Antwort vom Server')); }
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).error ?? `HTTP ${xhr.status}`)); }
        catch { reject(new Error(`HTTP ${xhr.status}`)); }
      }
    };

    xhr.onerror  = () => reject(new Error('Netzwerkfehler'));
    xhr.ontimeout = () => reject(new Error('Timeout'));
    xhr.timeout  = 120_000; // 2 min pro Chunk

    xhr.open('POST', UPLOAD_URL);
    xhr.setRequestHeader('X-Upload-Token', UPLOAD_TOKEN);
    xhr.send(formData);
  });
}

export function PlatformInput(props) {
  const { onChange, renderDefault } = props;

  const [status, setStatus]           = useState('idle');
  const [progress, setProgress]       = useState(0);
  const [transferred, setTransferred] = useState(0);
  const [total, setTotal]             = useState(0);
  const [filename, setFilename]       = useState('');
  const [chunkInfo, setChunkInfo]     = useState('');
  const [errorMsg, setErrorMsg]       = useState('');
  const fileInputRef                  = useRef(null);
  const abortRef                      = useRef(false);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    startChunkedUpload(file);
  }

  async function startChunkedUpload(file) {
    abortRef.current = false;
    setStatus('uploading');
    setProgress(0);
    setTransferred(0);
    setTotal(file.size);
    setFilename(file.name);
    setChunkInfo('');
    setErrorMsg('');

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const sessionId   = randomId();
    let bytesUploaded = 0;

    try {
      for (let i = 0; i < totalChunks; i++) {
        if (abortRef.current) throw new Error('Abgebrochen');

        const start = i * CHUNK_SIZE;
        const end   = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        setChunkInfo(`Chunk ${i + 1} / ${totalChunks}`);

        let lastError;
        let data;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (abortRef.current) throw new Error('Abgebrochen');
          try {
            data = await uploadChunk(
              chunk, i, totalChunks, file.name, sessionId,
              (loaded) => {
                const total_sent = bytesUploaded + loaded;
                setTransferred(total_sent);
                setProgress(Math.round((total_sent / file.size) * 100));
              }
            );
            lastError = null;
            break; // Chunk erfolgreich
          } catch (err) {
            lastError = err;
            if (attempt < MAX_RETRIES - 1) {
              setChunkInfo(`Chunk ${i + 1} / ${totalChunks} — Retry ${attempt + 1}…`);
              await sleep(1500 * (attempt + 1));
            }
          }
        }

        if (lastError) throw lastError;

        bytesUploaded += chunk.size;
        setTransferred(bytesUploaded);
        setProgress(Math.round((bytesUploaded / file.size) * 100));

        // Letzter Chunk — Server gibt URL + Size zurück
        if (i === totalChunks - 1 && data?.url) {
          onChange([
            set(data.url,              ['url']),
            set(formatBytes(data.size), ['size']),
          ]);
          setProgress(100);
          setStatus('done');
        }
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message ?? 'Unbekannter Fehler');
    }
  }

  const isUploading = status === 'uploading';

  return (
    <Stack space={4}>
      {/* ── Upload-Bereich ── */}
      <Card padding={3} border radius={2}>
        <Stack space={3}>
          <Flex gap={2} align="center" wrap="wrap">
            <Button
              icon={UploadIcon}
              text={isUploading ? 'Lädt hoch…' : 'Datei auf Server hochladen'}
              mode="ghost"
              tone="primary"
              disabled={isUploading}
              onClick={() => !isUploading && fileInputRef.current?.click()}
            />
            {status === 'done' && (
              <Flex align="center" gap={1}>
                <CheckmarkCircleIcon style={{ color: '#43d675' }} />
                <Text size={1} style={{ color: '#43d675' }}>
                  Hochgeladen — URL &amp; Größe eingetragen
                </Text>
              </Flex>
            )}
            {status === 'error' && (
              <Flex align="center" gap={1}>
                <ErrorOutlineIcon style={{ color: '#f03e2f' }} />
                <Text size={1} style={{ color: '#f03e2f' }}>{errorMsg}</Text>
              </Flex>
            )}
          </Flex>

          {/* Fortschrittsanzeige */}
          {isUploading && (
            <Stack space={2}>
              <Flex justify="space-between">
                <Text size={1} muted style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
                  {filename}
                </Text>
                <Text size={1} muted>{chunkInfo}</Text>
                <Text size={1} muted>
                  {formatBytes(transferred)} / {formatBytes(total)}
                </Text>
              </Flex>
              <Box style={{ background: 'var(--card-border-color)', borderRadius: 4, overflow: 'hidden', height: 6 }}>
                <Box style={{ width: `${progress}%`, height: '100%', background: '#f36', transition: 'width 0.15s ease' }} />
              </Box>
              <Text size={1} muted style={{ textAlign: 'right' }}>{progress}%</Text>
            </Stack>
          )}
        </Stack>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── Standard-Felder darunter ── */}
      {renderDefault(props)}
    </Stack>
  );
}
