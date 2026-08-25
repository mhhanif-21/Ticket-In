class ParticipantAnswerRow {
  final String label;
  final String value;

  const ParticipantAnswerRow({required this.label, required this.value});
}

Map<String, dynamic> _asStringKeyedMap(Object? value) {
  if (value is! Map) return <String, dynamic>{};
  return Map<String, dynamic>.fromEntries(
    value.entries
        .where((entry) => entry.key != null)
        .map((entry) => MapEntry(entry.key.toString(), entry.value)),
  );
}

String _humanizeAnswerKey(String key) {
  final fieldNumber = RegExp(r'^field_?(\d+)$', caseSensitive: false).firstMatch(key);
  if (fieldNumber != null) return 'Field ${fieldNumber.group(1)}';

  final separated = key.replaceAll(RegExp(r'[_-]+'), ' ').trim();
  if (separated.isEmpty) return 'Jawaban';
  return separated[0].toUpperCase() + separated.substring(1);
}

String displayParticipantAnswerValue(Object? value) {
  if (value == null) return '-';

  if (value is String) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? '-' : trimmed;
  }

  if (value is Iterable) {
    final items = value
        .map(displayParticipantAnswerValue)
        .where((item) => item != '-')
        .toList();
    return items.isEmpty ? '-' : items.join(', ');
  }

  if (value is Map) {
    final fileName = value['fileName'];
    if (fileName is String && fileName.trim().isNotEmpty) return fileName.trim();

    final entries = value.entries
        .where((entry) => entry.key.toString() != 'path')
        .map((entry) => '${entry.key}: ${displayParticipantAnswerValue(entry.value)}')
        .where((entry) => !entry.endsWith(': -'))
        .toList();
    return entries.isEmpty ? '-' : entries.join(', ');
  }

  return value.toString().trim().isEmpty ? '-' : value.toString();
}

List<ParticipantAnswerRow> buildParticipantAnswerRows({
  Object? answers,
  Object? answerFieldLabels,
}) {
  final answerMap = _asStringKeyedMap(answers);
  final labelMap = _asStringKeyedMap(answerFieldLabels);

  return answerMap.entries.map((entry) {
    final configuredLabel = labelMap[entry.key];
    final label = configuredLabel is String && configuredLabel.trim().isNotEmpty
        ? configuredLabel.trim()
        : _humanizeAnswerKey(entry.key);
    return ParticipantAnswerRow(
      label: label,
      value: displayParticipantAnswerValue(entry.value),
    );
  }).toList();
}

String participantOrganizationValue({
  Object? answers,
  Object? answerFieldLabels,
}) {
  const organizationLabels = {
    'organisasi',
    'organization',
    'company',
    'perusahaan',
    'instansi',
  };

  for (final row in buildParticipantAnswerRows(
    answers: answers,
    answerFieldLabels: answerFieldLabels,
  )) {
    final normalizedLabel = row.label.toLowerCase().trim();
    if (organizationLabels.any(
      (candidate) => normalizedLabel == candidate || normalizedLabel.contains(candidate),
    )) {
      return row.value;
    }
  }
  return '-';
}
