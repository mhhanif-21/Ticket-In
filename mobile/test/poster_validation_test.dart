import 'dart:io';
import 'package:event_gate_admin/services/poster_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory temp;

  setUp(() async {
    temp = await Directory.systemTemp.createTemp('event-gate-poster-test-');
  });

  tearDown(() async {
    if (await temp.exists()) await temp.delete(recursive: true);
  });

  test('accepts valid JPEG and PNG signatures and rejects invalid files', () async {
    final jpeg = await File('${temp.path}/poster.jpg').writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00]);
    final png = await File('${temp.path}/poster.png').writeAsBytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    final invalid = await File('${temp.path}/poster.txt').writeAsBytes([0x25, 0x50, 0x44, 0x46]);

    expect(await hasSupportedPosterSignature(jpeg), isTrue);
    expect(await hasSupportedPosterSignature(png), isTrue);
    expect(await hasSupportedPosterSignature(invalid), isFalse);
  });
}
