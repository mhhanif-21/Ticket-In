import 'dart:io';

const int maxEventImageBytes = 5 * 1024 * 1024;

Future<String?> validateEventImageFile(File file) async {
  final fileSize = await file.length();
  if (fileSize > maxEventImageBytes) {
    final sizeInMegabytes = fileSize / (1024 * 1024);
    return 'Ukuran ${file.uri.pathSegments.last} ${sizeInMegabytes.toStringAsFixed(1)} MB. Maksimal 5 MB.';
  }

  if (!await hasSupportedPosterSignature(file)) {
    return 'Format ${file.uri.pathSegments.last} tidak didukung. Gunakan JPG, PNG, atau WebP.';
  }

  return null;
}

Future<bool> hasSupportedPosterSignature(File file) async {
  final bytes = await file
      .openRead(0, 12)
      .fold<List<int>>([], (all, chunk) => all..addAll(chunk));
  final isJpeg =
      bytes.length >= 3 &&
      bytes[0] == 0xFF &&
      bytes[1] == 0xD8 &&
      bytes[2] == 0xFF;
  final isPng =
      bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47 &&
      bytes[4] == 0x0D &&
      bytes[5] == 0x0A &&
      bytes[6] == 0x1A &&
      bytes[7] == 0x0A;
  final isWebp =
      bytes.length >= 12 &&
      bytes[0] == 0x52 &&
      bytes[1] == 0x49 &&
      bytes[2] == 0x46 &&
      bytes[3] == 0x46 &&
      bytes[8] == 0x57 &&
      bytes[9] == 0x45 &&
      bytes[10] == 0x42 &&
      bytes[11] == 0x50;
  return isJpeg || isPng || isWebp;
}
