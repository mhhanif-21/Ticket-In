class ParticipantAnswerRow {
  final String fieldKey;
  final String label;
  final String value;
  final Object? rawValue;

  const ParticipantAnswerRow({
    required this.fieldKey,
    required this.label,
    required this.value,
    required this.rawValue,
  });

  bool get isFile => rawValue is Map &&
      (rawValue as Map)['fileName'] is String &&
      ((rawValue as Map)['fileName'] as String).trim().isNotEmpty;

  String get mimeType {
    if (rawValue is Map) {
      final value = (rawValue as Map)['type'];
      if (value is String && value.trim().isNotEmpty) return value.trim().toLowerCase();
    }
    final lowerName = value.toLowerCase();
    if (lowerName.endsWith('.pdf')) return 'application/pdf';
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
    if (lowerName.endsWith('.png')) return 'image/png';
    if (lowerName.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  bool get isImage => isFile && mimeType.startsWith('image/');
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

  final keys = <String>[...labelMap.keys];
  for (final key in answerMap.keys) {
    if (!labelMap.containsKey(key)) keys.add(key);
  }

  return keys.map((key) {
    final configuredLabel = labelMap[key];
    final label = configuredLabel is String && configuredLabel.trim().isNotEmpty
        ? configuredLabel.trim()
        : _humanizeAnswerKey(key);
    return ParticipantAnswerRow(
      fieldKey: key,
      label: label,
      value: displayParticipantAnswerValue(answerMap[key]),
      rawValue: answerMap[key],
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
