<?php
declare(strict_types=1);

const CONTENT_CHUNK_SIZE = 4194304;
const CONTENT_MAX_SIZE = 536870912;

function content_root(): string { return getenv('Q3RALLY_CONTENT_ROOT') ?: '/var/www/content.q3rally.com'; }
function content_staging(): string { return getenv('Q3RALLY_CONTENT_STAGING') ?: '/var/lib/q3rally-content-upload'; }
function content_error(string $message): void { throw new RuntimeException($message); }
function content_text($value, string $label, int $max = 120): string {
    if (!is_string($value) || trim($value) === '' || strlen($value) > $max || preg_match('/[\x00-\x1f\x7f]/', $value)) {
        content_error('Invalid ' . $label . '.');
    }
    return trim($value);
}
function content_metadata(array $input): array {
    $id = content_text($input['id'] ?? null, 'ID', 80);
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]*$/D', $id)) content_error('ID: letters, digits, hyphens and underscores only.');
    $type = $input['type'] ?? '';
    if (!in_array($type, ['track', 'vehicle', 'skin'], true)) content_error('Invalid content type.');
    $filename = content_text($input['filename'] ?? null, 'filename', 120);
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]*\.pk3$/iD', $filename)) content_error('Use a .pk3 filename containing only letters, digits, dots, hyphens and underscores.');
    $size = $input['size'] ?? null;
    if (!is_int($size) || $size < 1 || $size > CONTENT_MAX_SIZE) content_error('PK3 size must be between 1 byte and 512 MiB.');
    $dependencies = $input['dependencies'] ?? [];
    if (!is_array($dependencies) || count($dependencies) > 50 || array_values($dependencies) !== $dependencies) content_error('Invalid dependencies.');
    foreach ($dependencies as $dependency) {
        if (!is_string($dependency) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/D', $dependency) || strcasecmp($dependency, $id) === 0) content_error('Invalid dependency ID.');
    }
    return [
        'id' => $id, 'type' => $type, 'filename' => $filename, 'size' => $size,
        'name' => content_text($input['name'] ?? null, 'name'),
        'author' => content_text($input['author'] ?? null, 'author'),
        'version' => content_text($input['version'] ?? null, 'version', 40),
        'dependencies' => array_values(array_unique($dependencies)),
    ];
}
function content_folder(string $type): string { return ['track' => 'tracks', 'vehicle' => 'vehicles', 'skin' => 'skins'][$type]; }
function content_read_index(): array {
    $raw = file_get_contents(content_root() . '/index.json');
    if ($raw === false) content_error('Cannot read content index.');
    $index = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($index) || ($index['version'] ?? null) !== 1 || !isset($index['content']) || !is_array($index['content'])
        || array_values($index['content']) !== $index['content']) content_error('Unsupported or invalid content index; nothing changed.');
    foreach ($index['content'] as $entry) {
        if (!is_array($entry) || !is_string($entry['id'] ?? null)) content_error('Invalid existing index entry.');
    }
    return $index;
}
function content_conflicts(array $index, array $meta): void {
    $folder = content_folder($meta['type']);
    $ids = [];
    foreach ($index['content'] as $entry) {
        $ids[] = $entry['id'];
        if (strcasecmp($entry['id'], $meta['id']) === 0) content_error('This content ID already exists. Use a new ID for a new release.');
        if (($entry['type'] ?? '') === $meta['type'] && strcasecmp($entry['file'] ?? '', $meta['filename']) === 0) content_error('This filename is already indexed.');
    }
    foreach ($meta['dependencies'] as $dependency) if (!in_array($dependency, $ids, true)) content_error('Unknown dependency ID: ' . $dependency);
    $directory = content_root() . '/files/' . $folder;
    if (!is_dir($directory) || !is_writable($directory)) content_error('Content destination is not writable.');
    foreach (new DirectoryIterator($directory) as $file) {
        if (strcasecmp($file->getFilename(), $meta['filename']) === 0) content_error('A file with this name already exists.');
    }
}
function content_atomic_json(string $path, array $data, int $mode = 0600): void {
    $temp = tempnam(dirname($path), '.content-');
    if ($temp === false) content_error('Cannot create temporary index.');
    try {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
        if (file_put_contents($temp, $json) !== strlen($json) || !chmod($temp, $mode) || !rename($temp, $path)) content_error('Cannot save index.');
    } finally { if (is_file($temp)) unlink($temp); }
}
function content_cleanup(): void {
    $checked = 0;
    foreach (new DirectoryIterator(content_staging()) as $item) {
        if ($checked >= 50) break;
        if (!$item->isDir() || $item->isLink() || !preg_match('/^[a-f0-9]{32}$/D', $item->getFilename())) continue;
        $directory = $item->getPathname();
        $manifestPath = $directory . '/manifest.json';
        if (!is_file($manifestPath) || filemtime($manifestPath) > time() - 86400) continue;
        $checked++;
        $lock = fopen($directory . '/lock', 'c');
        if (!$lock) continue;
        if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); continue; }
        try {
            foreach (new DirectoryIterator($directory) as $file) {
                if ($file->isFile() && !$file->isLink() && $file->getFilename() !== 'lock') unlink($file->getPathname());
            }
        } finally { flock($lock, LOCK_UN); fclose($lock); }
        unlink($directory . '/lock');
        rmdir($directory);
    }
}
function content_start(array $input, string $owner): array {
    $meta = content_metadata($input);
    if (!class_exists('ZipArchive')) content_error('PHP ZIP extension is missing.');
    if (!is_dir(content_staging()) || !is_writable(content_staging())) content_error('Private upload directory is unavailable.');
    content_cleanup();
    content_conflicts(content_read_index(), $meta);
    $id = bin2hex(random_bytes(16));
    $directory = content_staging() . '/' . $id;
    if (!mkdir($directory, 0700)) content_error('Cannot create upload.');
    content_atomic_json($directory . '/manifest.json', ['owner' => $owner, 'meta' => $meta, 'created' => time()]);
    return ['upload' => $id, 'chunkSize' => CONTENT_CHUNK_SIZE];
}
function content_upload(string $id, string $owner, callable $operation) {
    if (!preg_match('/^[a-f0-9]{32}$/D', $id)) content_error('Invalid upload ID.');
    $directory = content_staging() . '/' . $id;
    if (!is_dir($directory) || is_link($directory)) content_error('Upload not found.');
    $lock = fopen($directory . '/lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) content_error('Upload is busy.');
    try {
        $manifest = json_decode((string)file_get_contents($directory . '/manifest.json'), true, 512, JSON_THROW_ON_ERROR);
        if (!hash_equals($manifest['owner'], $owner)) content_error('Upload belongs to another login session.');
        if (time() - $manifest['created'] > 86400) content_error('Upload expired. Start again.');
        return $operation($directory, $manifest['meta']);
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
function content_chunk(string $directory, array $meta, int $number, string $temp, int $size): array {
    $count = (int)ceil($meta['size'] / CONTENT_CHUNK_SIZE);
    $expected = $number === $count - 1 ? $meta['size'] - $number * CONTENT_CHUNK_SIZE : CONTENT_CHUNK_SIZE;
    if ($number < 0 || $number >= $count || $size !== $expected || filesize($temp) !== $expected) content_error('Invalid chunk size or number.');
    $destination = $directory . '/' . $number . '.part';
    if (file_exists($destination)) {
        if (hash_file('sha256', $destination) !== hash_file('sha256', $temp)) content_error('Chunk conflicts with an earlier upload.');
    } elseif (!copy($temp, $destination)) content_error('Cannot save upload chunk.');
    chmod($destination, 0600);
    return ['received' => $number];
}
function content_validate_pk3(string $file): void {
    if (!class_exists('ZipArchive')) content_error('PHP ZIP extension is missing.');
    $zip = new ZipArchive();
    if ($zip->open($file, ZipArchive::CHECKCONS) !== true) content_error('The .pk3 file is not a valid ZIP archive.');
    try {
        if ($zip->numFiles < 1 || $zip->numFiles > 20000) content_error('PK3 must have 1–20,000 entries.');
        $total = 0;
        $files = 0;
        $names = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entry = $zip->statIndex($i);
            if (!$entry) content_error('Invalid PK3 entry.');
            $name = $entry['name'];
            if ($name === '' || preg_match('~(^/|\\\\|(^|/)\.\.(/|$)|[\x00-\x1f\x7f]|:)~', $name)) content_error('PK3 contains an unsafe archive path.');
            if (!in_array($entry['comp_method'], [0, 8], true) || ($entry['encryption_method'] ?? 0) !== 0) content_error('PK3 uses unsupported compression or encryption.');
            $total += $entry['size'];
            if ($total > 1073741824) content_error('Uncompressed PK3 exceeds 1 GiB.');
            if (isset($names[strtolower($name)])) content_error('PK3 contains duplicate archive paths.');
            $names[strtolower($name)] = true;
            if (substr($name, -1) !== '/') {
                $stream = $zip->getStream($name);
                if (!$stream) content_error('Cannot read PK3 entry.');
                try {
                    $hash = hash_init('crc32b');
                    $bytes = hash_update_stream($hash, $stream, $entry['size'] + 1);
                    $crc = hash_final($hash);
                    if ($bytes !== $entry['size'] || $crc !== sprintf('%08x', $entry['crc'] & 0xffffffff)) content_error('PK3 contains damaged file data.');
                } finally { fclose($stream); }
                $files++;
            }
        }
        if (!$files) content_error('PK3 contains no files.');
    } finally { $zip->close(); }
}
function content_publish(array $meta, string $package, ?string $preview): array {
    $lock = fopen(content_staging() . '/index.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) content_error('Cannot lock content index.');
    $created = [];
    try {
        $index = content_read_index();
        content_conflicts($index, $meta);
        $folder = content_folder($meta['type']);
        $base = 'https://content.q3rally.com';
        $entry = [
            'id' => $meta['id'], 'type' => $meta['type'], 'name' => $meta['name'],
            'author' => $meta['author'], 'version' => $meta['version'], 'file' => $meta['filename'],
            'url' => $base . '/files/' . $folder . '/' . rawurlencode($meta['filename']),
            'size' => filesize($package), 'checksum_md5' => md5_file($package),
            'preview' => '', 'dependencies' => $meta['dependencies'],
        ];
        $files = [[$package, content_root() . '/files/' . $folder . '/' . $meta['filename']]];
        if ($preview !== null) {
            $image = @getimagesize($preview);
            $ext = $image ? ([IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'][$image[2]] ?? null) : null;
            if (!$ext || filesize($preview) > 5242880 || $image[0] > 8192 || $image[1] > 8192) content_error('Preview must be JPG, PNG or WebP, at most 5 MiB and 8192×8192 pixels.');
            $name = $meta['id'] . '.' . $ext;
            $destination = content_root() . '/previews/' . $folder . '/' . $name;
            if (file_exists($destination)) content_error('Preview filename already exists.');
            $files[] = [$preview, $destination];
            $entry['preview'] = $base . '/previews/' . $folder . '/' . rawurlencode($name);
        }
        // Preserve a private byte-for-byte backup before touching public files.
        $backup = content_staging() . '/index-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.json';
        if (!copy(content_root() . '/index.json', $backup)) content_error('Cannot back up index.');
        chmod($backup, 0600);
        foreach ($files as [$source, $destination]) {
            $temp = tempnam(dirname($destination), '.content-');
            if ($temp === false) content_error('Cannot stage public file.');
            try {
                if (!copy($source, $temp) || !chmod($temp, 0644) || !link($temp, $destination)) content_error('Cannot publish file; existing files are never overwritten.');
                $created[] = $destination;
            } finally { if (is_file($temp)) unlink($temp); }
        }
        $index['content'][] = $entry;
        $index['updated'] = gmdate('Y-m-d');
        content_atomic_json(content_root() . '/index.json', $index, 0644);
        return $entry;
    } catch (Throwable $e) {
        foreach ($created as $file) unlink($file);
        throw $e;
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
function content_finish(string $directory, array $meta, ?string $preview): array {
    if (file_exists($directory . '/published.json')) return json_decode((string)file_get_contents($directory . '/published.json'), true, 512, JSON_THROW_ON_ERROR);
    $package = $directory . '/package.pk3';
    $output = fopen($package, 'wb');
    if (!$output) content_error('Cannot assemble PK3.');
    try {
        $count = (int)ceil($meta['size'] / CONTENT_CHUNK_SIZE);
        for ($i = 0; $i < $count; $i++) {
            $part = $directory . '/' . $i . '.part';
            if (!is_file($part)) content_error('Upload is incomplete.');
            $input = fopen($part, 'rb');
            try { if (stream_copy_to_stream($input, $output) !== filesize($part)) content_error('Cannot assemble PK3.'); }
            finally { fclose($input); }
        }
    } finally { fclose($output); }
    if (filesize($package) !== $meta['size']) content_error('Uploaded size does not match original file.');
    content_validate_pk3($package);
    $entry = content_publish($meta, $package, $preview);
    content_atomic_json($directory . '/published.json', $entry);
    foreach (glob($directory . '/*.part') ?: [] as $part) unlink($part);
    unlink($package);
    return $entry;
}

function content_entry_revision(array $entry): string {
    return hash('sha256', json_encode($entry, JSON_THROW_ON_ERROR));
}
function content_delete_path(string $url, string $group, string $folder): string {
    $prefix = 'https://content.q3rally.com/' . $group . '/' . $folder . '/';
    if (strpos($url, $prefix) !== 0) content_error('Entry has an unexpected file URL; nothing deleted.');
    $name = rawurldecode(substr($url, strlen($prefix)));
    $extension = $group === 'files' ? 'pk3' : '(?:jpg|jpeg|png|webp)';
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]*\.' . $extension . '$/iD', $name)) content_error('Entry has an unsafe filename; nothing deleted.');
    $directory = content_root() . '/' . $group . '/' . $folder;
    $path = $directory . '/' . $name;
    if (is_link($path) || realpath($directory) !== $directory) content_error('Unexpected symbolic link; nothing deleted.');
    return $path;
}
function content_delete(string $id, string $confirmation, string $revision): array {
    if ($id === '' || !hash_equals($id, $confirmation)) content_error('Type the exact content ID to confirm deletion.');
    $lock = fopen(content_staging() . '/index.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) content_error('Cannot lock content index.');
    $moved = [];
    $committed = false;
    try {
        $index = content_read_index();
        $matches = array_keys(array_filter($index['content'], fn($entry) => $entry['id'] === $id));
        if (count($matches) !== 1) content_error('Content is missing or ambiguous. Reload the list.');
        $position = $matches[0];
        $entry = $index['content'][$position];
        if (!hash_equals(content_entry_revision($entry), $revision)) content_error('This entry changed. Reload the list before deleting.');
        $folder = content_folder($entry['type']);
        $paths = [content_delete_path($entry['url'] ?? '', 'files', $folder)];
        if (basename($paths[0]) !== ($entry['file'] ?? '')) content_error('Filename does not match index URL; nothing deleted.');
        $preview = $entry['preview'] ?? '';
        $sharedPreview = false;
        foreach ($index['content'] as $otherPosition => $other) {
            if ($otherPosition === $position) continue;
            if (in_array($id, $other['dependencies'] ?? [], true)) content_error('Cannot delete: required by ' . $other['id'] . '.');
            if (rawurldecode($other['url'] ?? '') === rawurldecode($entry['url'] ?? '')) content_error('Another entry uses this package; nothing deleted.');
            if ($preview !== '' && rawurldecode($other['preview'] ?? '') === rawurldecode($preview)) $sharedPreview = true;
        }
        if ($preview !== '' && !$sharedPreview) $paths[] = content_delete_path($preview, 'previews', $folder);
        $backup = content_staging() . '/deleted-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(8));
        if (!mkdir($backup, 0700)) content_error('Cannot create deletion backup.');
        if (!copy(content_root() . '/index.json', $backup . '/index.json')) content_error('Cannot back up index.');
        chmod($backup . '/index.json', 0600);
        content_atomic_json($backup . '/entry.json', $entry);
        $missing = [];
        foreach ($paths as $number => $path) {
            if (!file_exists($path)) { $missing[] = basename($path); continue; }
            if (!is_file($path) || !is_writable(dirname($path))) content_error('Content directory is not writable; nothing deleted.');
            if (!copy($path, $backup . '/' . $number . '-' . basename($path))) content_error('Cannot back up content; nothing deleted.');
            chmod($backup . '/' . $number . '-' . basename($path), 0600);
        }
        // Same-filesystem renames are reversible until the index is committed.
        foreach ($paths as $path) {
            if (!file_exists($path)) continue;
            $hidden = dirname($path) . '/.deleted-' . bin2hex(random_bytes(16));
            if (!rename($path, $hidden)) content_error('Cannot remove public file.');
            $moved[] = [$path, $hidden];
        }
        array_splice($index['content'], $position, 1);
        $index['updated'] = gmdate('Y-m-d');
        content_atomic_json(content_root() . '/index.json', $index, 0644);
        $committed = true;
        foreach ($moved as [$path, $hidden]) {
            // Backup is retained privately; failed cleanup must not undo a committed deletion.
            if (!@unlink($hidden)) error_log('Q3Rally content: hidden deleted-file cleanup required');
        }
        return ['deleted' => $id, 'backup' => basename($backup), 'missing' => $missing, 'sharedPreviewKept' => $sharedPreview];
    } finally {
        if (!$committed) {
            foreach (array_reverse($moved) as [$path, $hidden]) {
                if (!rename($hidden, $path)) error_log('Q3Rally content: deletion rollback needs manual recovery');
            }
        }
        flock($lock, LOCK_UN); fclose($lock);
    }
}
