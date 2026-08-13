import 'package:flutter_test/flutter_test.dart';
import 'package:event_gate_admin/services/admin_service.dart';

void main() {
  test('export status reads the canonical snake_case file_url', () {
    expect(exportFileUrl({'file_url': 'data:text/csv;base64,Zm9v'}), 'data:text/csv;base64,Zm9v');
    expect(exportFileUrl({'fileUrl': 'https://example.test/wrong.csv'}), isNull);
    expect(exportFileUrl({'file_url': null}), isNull);
  });
}
