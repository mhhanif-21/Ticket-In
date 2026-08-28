enum PosterAspectMode {
  portrait,
  landscape,
  banner,
}

extension PosterAspectModeValue on PosterAspectMode {
  String get wireValue => switch (this) {
    PosterAspectMode.portrait => 'portrait',
    PosterAspectMode.landscape => 'landscape',
    PosterAspectMode.banner => 'banner',
  };

  String get label => switch (this) {
    PosterAspectMode.portrait => 'Portrait 4:5',
    PosterAspectMode.landscape => 'Landscape 16:9',
    PosterAspectMode.banner => 'Banner 19:6',
  };

  double get ratio => switch (this) {
    PosterAspectMode.portrait => 4 / 5,
    PosterAspectMode.landscape => 16 / 9,
    PosterAspectMode.banner => 19 / 6,
  };
}

PosterAspectMode posterAspectModeFromJson(Object? value) {
  return switch (value?.toString().trim().toLowerCase()) {
    'portrait' => PosterAspectMode.portrait,
    'banner' => PosterAspectMode.banner,
    _ => PosterAspectMode.landscape,
  };
}
