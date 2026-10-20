<?php
declare(strict_types=1);
require_once __DIR__ . '/keys.php';
keys_require_admin();
require_once __DIR__ . '/content-library.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    if (!keys_admin_csrf_ok()) {
        http_response_code(403);
        echo json_encode(['error' => 'Login/form expired. Reload this page and sign in again.']);
        exit;
    }
    $owner = hash('sha256', session_id());
    session_write_close();
    set_error_handler(function ($severity, $message, $file, $line) {
        if (!(error_reporting() & $severity)) return false;
        throw new ErrorException('Content filesystem operation failed.', 0, $severity);
    });
    try {
        $action = $_POST['action'] ?? '';
        if ($action === 'start') {
            $input = json_decode(is_string($_POST['metadata'] ?? null) ? $_POST['metadata'] : '', true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($input)) content_error('Invalid metadata.');
            $result = content_start($input, $owner);
        } elseif ($action === 'delete') {
            $id = is_string($_POST['id'] ?? null) ? $_POST['id'] : '';
            $confirmation = is_string($_POST['confirmation'] ?? null) ? $_POST['confirmation'] : '';
            $revision = is_string($_POST['revision'] ?? null) ? $_POST['revision'] : '';
            $result = content_delete($id, $confirmation, $revision);
        } elseif (in_array($action, ['chunk', 'finish'], true)) {
            $id = is_string($_POST['upload'] ?? null) ? $_POST['upload'] : '';
            $result = content_upload($id, $owner, function ($directory, $meta) use ($action) {
                if ($action === 'chunk') {
                    $file = $_FILES['file'] ?? [];
                    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) content_error('Chunk upload failed. Check PHP upload limits.');
                    $number = filter_var($_POST['number'] ?? null, FILTER_VALIDATE_INT);
                    if ($number === false || $number === null) content_error('Invalid chunk number.');
                    return content_chunk($directory, $meta, $number, $file['tmp_name'], $file['size']);
                }
                $preview = null;
                if (isset($_FILES['preview']) && ($_FILES['preview']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
                    $file = $_FILES['preview'];
                    if (($file['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) content_error('Preview upload failed.');
                    $preview = $file['tmp_name'];
                }
                return ['entry' => content_finish($directory, $meta, $preview)];
            });
        } else {
            content_error('Unknown upload action.');
        }
        echo json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    } catch (Throwable $e) {
        http_response_code(400);
        // No PHP traces, private paths or authentication data in responses.
        $message = $e instanceof RuntimeException && !($e instanceof JsonException) ? $e->getMessage() : 'Upload failed. Check the index format and server permissions.';
        echo json_encode(['error' => $message]);
    }
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET, POST'); http_response_code(405); exit;
}
$csrf = keys_admin_csrf_token();
$entries = [];
$indexError = '';
try { $entries = content_read_index()['content']; }
catch (Throwable $e) { $indexError = 'Cannot read the existing content index. Upload is unavailable until it is restored.'; }
function content_escape($value): string { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Q3Rally — Content Uploader</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0c0e12;color:#eee;font:16px/1.5 system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:28px 20px}nav{display:flex;gap:24px;flex-wrap:wrap}a{color:#ff7633}h1{margin-bottom:8px}p{color:#b5bbc5}form,section{background:#171a21;border:1px solid #303640;border-radius:8px;padding:24px;margin-top:24px}fieldset{border:0;padding:0;margin:0;min-width:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}label{display:block;font-weight:600}input,select,textarea{display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #505967;border-radius:4px;background:#0d1118;color:#fff;font:inherit}small{display:block;color:#aab1bc;font-weight:400;margin-top:6px}button{background:#ff5500;border:0;border-radius:4px;padding:12px 20px;color:#fff;font:600 16px system-ui;cursor:pointer;margin-top:24px}button:disabled{opacity:.5;cursor:wait}progress{width:100%;margin-top:20px}#status{white-space:pre-wrap;overflow-wrap:anywhere}#result{overflow-wrap:anywhere}.delete-content{margin:0;padding:7px 12px;background:#9b3030;font-size:14px}.error{color:#ff9393}.success{color:#85dba3}.table{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #303640;white-space:nowrap}:focus-visible{outline:2px solid #ff7633;outline-offset:3px}@media(max-width:650px){.grid{grid-template-columns:1fr}form,section{padding:16px}}
</style>
</head>
<body><main>
<nav><a href="admin.php">← Ladder Admin</a><a href="https://www.q3rally.com/">Q3Rally Website ↗</a></nav>
<h1>Ingame Content Uploader</h1>
<p>Upload maps, vehicles and skins directly to content.q3rally.com. Publishing adds the package to the game's content index immediately.</p>
<?php if ($indexError): ?><p class="error"><?= content_escape($indexError) ?></p><?php endif; ?>
<?php if (!class_exists('ZipArchive')): ?><p class="error">PHP ZIP extension is missing.</p><?php endif; ?>
<form id="upload-form">
<fieldset id="fields" <?= $indexError || !class_exists('ZipArchive') ? 'disabled' : '' ?>>
<div class="grid">
<label>Category<select name="type"><option value="track">Map / Track</option><option value="vehicle">Vehicle</option><option value="skin">Skin</option></select></label>
<label>Content ID<input name="id" required maxlength="80" pattern="[A-Za-z0-9][A-Za-z0-9_-]*"><small>Unique ID. Letters, digits, hyphens and underscores.</small></label>
<label>Name<input name="name" required maxlength="120"></label>
<label>Author<input name="author" required maxlength="120"></label>
<label>Version<input name="version" required maxlength="40" value="v1"></label>
<label>PK3 package<input id="package" type="file" accept=".pk3" required><small>Up to 512 MiB. Original filename is preserved; files and IDs are never overwritten.</small></label>
<label>Preview image (optional)<input id="preview" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG or WebP, up to 5 MiB. Without an image the index receives an empty preview URL.</small></label>
<label>Dependency IDs (optional)<textarea name="dependencies" rows="3" maxlength="4000"></textarea><small>Existing content IDs separated by commas or newlines.</small></label>
</div>
<button type="submit">Upload &amp; publish content</button>
</fieldset>
<progress id="progress" value="0" max="100" hidden aria-label="Upload progress"></progress>
<p id="status" role="status" aria-live="polite"></p><div id="result"></div>
</form>
<section><h2>Existing content (<span id="content-count"><?= count($entries) ?></span>)</h2><p>Use these exact IDs for dependencies. Updating a package requires a new ID and filename.</p>
<p id="delete-status" role="status" aria-live="polite"></p><div class="table"><table><thead><tr><th>ID</th><th>Type</th><th>Name</th><th>Version</th><th>File</th><th>Action</th></tr></thead><tbody>
<?php foreach ($entries as $entry): ?><tr><?php foreach (['id','type','name','version','file'] as $field): ?><td><?= content_escape($entry[$field] ?? '') ?></td><?php endforeach; ?><td><button type="button" class="delete-content" data-id="<?= content_escape($entry['id']) ?>" data-revision="<?= content_escape(content_entry_revision($entry)) ?>">Delete</button></td></tr><?php endforeach; ?>
</tbody></table></div></section>
<script>
'use strict';
const csrf = <?= json_encode($csrf, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
const form = document.getElementById('upload-form');
const fields = document.getElementById('fields');
const status = document.getElementById('status');
const progress = document.getElementById('progress');
const result = document.getElementById('result');
let busy = false;
function send(action, values, onProgress) {
  return new Promise((resolve, reject) => {
    const data = new FormData(); data.append('csrf', csrf); data.append('action', action);
    for (const [key, value] of Object.entries(values)) data.append(key, value);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'content-upload.php'); xhr.timeout = 180000;
    if (onProgress) xhr.upload.onprogress = onProgress;
    xhr.onerror = () => reject(Error('Network error. Check the connection.'));
    xhr.ontimeout = () => reject(Error('Upload timed out.'));
    xhr.onload = () => {
      let response;
      try { response = JSON.parse(xhr.responseText); }
      catch { reject(Error('Unexpected response. Reload this page to check your login, PHP limits and server availability.')); return; }
      if (xhr.status < 200 || xhr.status >= 300 || response.error) reject(Error(response.error || `HTTP ${xhr.status}`));
      else resolve(response);
    };
    xhr.send(data);
  });
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const file = document.getElementById('package').files[0];
  const preview = document.getElementById('preview').files[0];
  if (!file) return;
  status.className = ''; result.replaceChildren();
  if (file.size < 1 || file.size > 536870912 || !/^[a-z0-9][a-z0-9_.-]*\.pk3$/i.test(file.name)) {
    status.textContent = 'Choose a .pk3 up to 512 MiB with a filename containing letters, digits, dots, hyphens and underscores.'; status.className = 'error'; return;
  }
  if (preview && preview.size > 5242880) { status.textContent = 'Preview exceeds 5 MiB.'; status.className = 'error'; return; }
  const values = new FormData(form);
  const metadata = Object.fromEntries(['id','type','name','author','version'].map(key => [key, values.get(key)]));
  metadata.filename = file.name; metadata.size = file.size;
  metadata.dependencies = values.get('dependencies').split(/[,\n]/).map(value => value.trim()).filter(Boolean);
  busy = true; fields.disabled = true; progress.hidden = false; progress.value = 0;
  try {
    status.textContent = 'Preparing upload…';
    const started = await send('start', {metadata: JSON.stringify(metadata)});
    const chunks = Math.ceil(file.size / started.chunkSize);
    for (let number = 0; number < chunks; number++) {
      const start = number * started.chunkSize;
      const chunk = file.slice(start, Math.min(start + started.chunkSize, file.size));
      let uploaded = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        status.textContent = `Uploading ${file.name}: chunk ${number + 1} / ${chunks}${attempt ? ' (retry)' : ''}`;
        try {
          await send('chunk', {upload: started.upload, number: String(number), file: chunk}, event => {
            if (event.lengthComputable) progress.value = Math.min(99, (start + chunk.size * event.loaded / event.total) / file.size * 100);
          });
          uploaded = true; break;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
      if (!uploaded) throw Error('Chunk upload failed.');
    }
    status.textContent = 'Checking PK3 and publishing index…';
    const finish = {upload: started.upload}; if (preview) finish.preview = preview;
    const response = await send('finish', finish);
    progress.value = 100; status.className = 'success';
    status.textContent = `Published: ${response.entry.name}\nSize: ${response.entry.size.toLocaleString()} bytes\nMD5: ${response.entry.checksum_md5}`;
    const link = document.createElement('a'); link.href = response.entry.url; link.textContent = response.entry.url; result.append(link);
    form.reset();
  } catch (error) {
    status.className = 'error'; status.textContent = error.message + '\nIf publication timed out, reload and check the existing content list before retrying.';
  } finally { busy = false; fields.disabled = false; }
});
const deleteStatus = document.getElementById('delete-status');
document.querySelectorAll('.delete-content').forEach(button => {
  button.addEventListener('click', async () => {
    if (busy) return;
    const id = button.dataset.id;
    const confirmation = window.prompt(`Delete "${id}" from the game content index and remove its PK3 and unshared preview? A private server backup will be retained. Already installed game files are unaffected.\n\nType the exact content ID to confirm:`);
    if (confirmation === null) return;
    if (confirmation !== id) { deleteStatus.className = 'error'; deleteStatus.textContent = 'ID did not match. Nothing deleted.'; return; }
    busy = true; fields.disabled = true;
    document.querySelectorAll('.delete-content').forEach(item => item.disabled = true);
    deleteStatus.className = ''; deleteStatus.textContent = `Deleting ${id}…`;
    try {
      const response = await send('delete', {id, confirmation, revision: button.dataset.revision});
      button.closest('tr').remove();
      const count = document.getElementById('content-count'); count.textContent = String(Number(count.textContent) - 1);
      deleteStatus.className = 'success';
      deleteStatus.textContent = `Deleted ${response.deleted}. Private server backup: ${response.backup}.`;
      if (response.sharedPreviewKept) deleteStatus.textContent += ' Shared preview retained.';
      if (response.missing.length) deleteStatus.textContent += ' Already missing: ' + response.missing.join(', ');
    } catch (error) {
      deleteStatus.className = 'error'; deleteStatus.textContent = error.message + ' Reload the list before retrying.';
    } finally {
      busy = false; fields.disabled = false;
      document.querySelectorAll('.delete-content').forEach(item => item.disabled = false);
    }
  });
});
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
</script>
</main></body></html>
