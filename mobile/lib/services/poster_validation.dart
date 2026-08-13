import 'dart:io';

Future<bool> hasSupportedPosterSignature(File file) async {
  final bytes = await file.openRead(0, 8).fold<List<int>>([], (all, chunk) => all..addAll(chunk));
  final isJpeg = bytes.length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF;
  final isPng = bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47 &&
      bytes[4] == 0x0D &&
      bytes[5] == 0x0A &&
      bytes[6] == 0x1A &&
      bytes[7] == 0x0A;
  return isJpeg || isPng;
}
