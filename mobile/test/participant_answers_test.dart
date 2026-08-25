import 'package:flutter_test/flutter_test.dart';
import 'package:event_gate_admin/utils/participant_answers.dart';

void main() {
  test('uses persisted human labels for answer keys', () {
    final rows = buildParticipantAnswerRows(
      answers: {'field1': 18},
      answerFieldLabels: {'field1': 'Umur'},
    );

    expect(rows.single.label, 'Umur');
    expect(rows.single.value, '18');
  });

  test('uses dash for missing values and supports file answers', () {
    final rows = buildParticipantAnswerRows(
      answers: {
        'field1': null,
        'field2': '   ',
        'field3': [],
        'field4': {'fileName': 'ktp.png', 'path': 'private/path'},
      },
      answerFieldLabels: {
        'field1': 'Umur',
        'field2': 'Alamat',
        'field3': 'Minat',
        'field4': 'Dokumen',
      },
    );

    expect(rows.map((row) => row.value).toList(), ['-', '-', '-', 'ktp.png']);
  });

  test('does not crash on malformed answers and falls back to readable key', () {
    final rows = buildParticipantAnswerRows(
      answers: 'not-an-object',
      answerFieldLabels: null,
    );

    expect(rows, isEmpty);
    expect(displayParticipantAnswerValue(null), '-');
  });
}
