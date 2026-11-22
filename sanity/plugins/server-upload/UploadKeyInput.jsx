import { useSyncExternalStore } from 'react';
import { Button, Flex, Stack, Text, TextInput } from '@sanity/ui';

// Shared only by inputs in this Studio tab. Never persist in CMS or browser storage.
let uploadKey = '';
const listeners = new Set();
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function setUploadKey(value) {
  uploadKey = value;
  for (const listener of listeners) listener();
}
export function useUploadKey() {
  return [useSyncExternalStore(subscribe, () => uploadKey, () => ''), setUploadKey];
}
export function UploadKeyInput({disabled = false}) {
  const [key, setKey] = useUploadKey();
  return (
    <Stack space={2}>
      <Flex gap={2}>
        <TextInput type="password" aria-label="Upload-Schlüssel" placeholder="Upload-Schlüssel"
          autoComplete="off" spellCheck={false} value={key} disabled={disabled}
          onChange={event => setKey(event.currentTarget.value)} />
        <Button text="Vergessen" mode="ghost" disabled={disabled || !key}
          onClick={() => setKey('')} />
      </Flex>
      <Text size={1} muted>Der Schlüssel bleibt nur in diesem Studio-Tab und wird nicht gespeichert.</Text>
    </Stack>
  );
}
