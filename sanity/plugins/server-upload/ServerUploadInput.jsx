import { useState, useRef } from 'react';
import { set, unset } from 'sanity';
import { Box, Button, Card, Flex, Stack, Text, TextInput } from '@sanity/ui';
import { UploadIcon, CheckmarkCircleIcon, ErrorOutlineIcon } from '@sanity/icons';

const UPLOAD_URL    = 'https://www.q3rally.com/upload/upload.php';
const UPLOAD_TOKEN  = import.meta.env.SANITY_STUDIO_UPLOAD_TOKEN ?? '';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ServerUploadInput(props) {
  const { value, onChange, elementProps } = props;

  const [status, setStatus]         = useState('idle');   // idle | uploading | done | error
  const [progress, setProgress]     = useState(0);
  const [transferred, setTransferred] = useState(0);
  const [total, setTotal]           = useState(0);
  const [filename, setFilename]     = useState('');
  const [errorMsg, setErrorMsg]     = useState('');
  const fileInputRef                = useRef(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';   // Reset so same file can be re-selected
    uploadFile(file);
  }

  function uploadFile(file) {
    setStatus('uploading');
    setProgress(0);
    setTransferred(0);
    setTotal(file.size);
    setFilename(file.name);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    // ── Fortschritt ──────────────────────────────────────
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
        setTransferred(e.loaded);
        setTotal(e.total);
      }
    };

    // ── Fertig ────────────────────────────────────────────
    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          onChange(set(data.url));
          setProgress(100);
          setStatus('done');
        } catch {
          setStatus('error');
          setErrorMsg('Ungültige Antwort vom Server');
        }
      } else {
        setStatus('error');
        try {
          const data = JSON.parse(xhr.responseText);
          setErrorMsg(data.error ?? `HTTP ${xhr.status}`);
        } catch {
          setErrorMsg(`HTTP ${xhr.status}`);
        }
      }
    };

    xhr.onerror = () => {
      setStatus('error');
      setErrorMsg('Netzwerkfehler beim Upload');
    };

    xhr.open('POST', UPLOAD_URL);
    xhr.setRequestHeader('X-Upload-Token', UPLOAD_TOKEN);
    xhr.send(formData);
  }

  const isUploading = status === 'uploading';

  return (
    <Stack space={3}>
      {/* URL-Feld — manuell editierbar */}
      <TextInput
        {...elementProps}
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value ? set(e.target.value) : unset())
        }
        placeholder="https://... oder Datei hochladen ↓"
        readOnly={isUploading}
      />

      {/* Upload-Button */}
      <Flex gap={2} align="center" wrap="wrap">
        <Button
          icon={UploadIcon}
          text={isUploading ? 'Lädt hoch…' : 'Auf Server hochladen'}
          mode="ghost"
          tone="primary"
          onClick={() => !isUploading && fileInputRef.current?.click()}
          disabled={isUploading}
        />
        {status === 'done' && (
          <Flex align="center" gap={1}>
            <CheckmarkCircleIcon style={{ color: '#43d675' }} />
            <Text size={1} style={{ color: '#43d675' }}>Hochgeladen</Text>
          </Flex>
        )}
        {status === 'error' && (
          <Flex align="center" gap={1}>
            <ErrorOutlineIcon style={{ color: '#f03e2f' }} />
            <Text size={1} style={{ color: '#f03e2f' }}>{errorMsg}</Text>
          </Flex>
        )}
      </Flex>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Fortschrittsanzeige */}
      {isUploading && (
        <Card padding={3} border radius={2} tone="primary">
          <Stack space={2}>
            {/* Dateiname + Größen */}
            <Flex justify="space-between" align="center">
              <Text size={1} muted style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {filename}
              </Text>
              <Text size={1} muted>
                {formatBytes(transferred)} / {formatBytes(total)}
              </Text>
            </Flex>

            {/* Progressbar */}
            <Box style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden', height: 6 }}>
              <Box
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: '#f36',
                  transition: 'width 0.15s ease',
                }}
              />
            </Box>

            {/* Prozentzahl */}
            <Text size={1} muted align="right">{progress}%</Text>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
