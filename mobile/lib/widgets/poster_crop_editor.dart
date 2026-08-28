import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Applies one Flutter scale gesture translation to the current crop offset.
///
/// `ScaleUpdateDetails.focalPointDelta` is relative to the previous update,
/// so callers must feed the returned value back into the next update.
Offset accumulateCropPanOffset(Offset currentOffset, Offset focalPointDelta) {
  return currentOffset + focalPointDelta;
}

/// Small dependency-free crop editor for event posters.
///
/// The visible frame is always locked to the event aspect ratio. The same
/// transform is then rendered to a PNG, so the uploaded object is actually
/// cropped rather than merely displayed with a cover fit.
class PosterCropEditor extends StatefulWidget {
  const PosterCropEditor({
    super.key,
    required this.file,
    required this.aspectRatio,
  });

  final File file;
  final double aspectRatio;

  static Future<File?> show({
    required BuildContext context,
    required File file,
    required double aspectRatio,
  }) {
    return showDialog<File?>(
      context: context,
      barrierDismissible: false,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: PosterCropEditor(file: file, aspectRatio: aspectRatio),
      ),
    );
  }

  @override
  State<PosterCropEditor> createState() => _PosterCropEditorState();
}

class _PosterCropEditorState extends State<PosterCropEditor> {
  Uint8List? _bytes;
  int? _imageWidth;
  int? _imageHeight;
  String? _error;
  double _zoom = 1;
  double _gestureZoom = 1;
  Offset _offset = Offset.zero;
  Size _frameSize = Size.zero;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _loadImage();
  }

  Future<void> _loadImage() async {
    try {
      final bytes = await widget.file.readAsBytes();
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      final width = frame.image.width;
      final height = frame.image.height;
      frame.image.dispose();
      codec.dispose();
      if (!mounted) return;
      setState(() {
        _bytes = bytes;
        _imageWidth = width;
        _imageHeight = height;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Gambar tidak dapat dibuka untuk dipotong.');
    }
  }

  double _baseScale(Size frameSize) {
    final width = _imageWidth ?? 1;
    final height = _imageHeight ?? 1;
    return math.max(frameSize.width / width, frameSize.height / height);
  }

  Offset _clampOffset(Offset candidate, Size frameSize, {double? zoom}) {
    final imageWidth = (_imageWidth ?? 1) * _baseScale(frameSize) * (zoom ?? _zoom);
    final imageHeight = (_imageHeight ?? 1) * _baseScale(frameSize) * (zoom ?? _zoom);
    final maxX = math.max(0, (imageWidth - frameSize.width) / 2);
    final maxY = math.max(0, (imageHeight - frameSize.height) / 2);
    return Offset(
      candidate.dx.clamp(-maxX, maxX).toDouble(),
      candidate.dy.clamp(-maxY, maxY).toDouble(),
    );
  }

  void _reset() {
    setState(() {
      _zoom = 1;
      _offset = Offset.zero;
    });
  }

  Future<void> _confirm() async {
    if (_bytes == null || _imageWidth == null || _imageHeight == null || _isSaving) {
      return;
    }
    setState(() => _isSaving = true);
    try {
      final output = await _renderCrop();
      if (!mounted) return;
      Navigator.of(context).pop(output);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isSaving = false;
        _error = 'Gambar belum dapat diproses. Silakan coba lagi.';
      });
    }
  }

  Future<File> _renderCrop() async {
    final codec = await ui.instantiateImageCodec(_bytes!);
    final frame = await codec.getNextFrame();
    final image = frame.image;
    final frameSize = _frameSize == Size.zero
        ? Size(320, 320 / widget.aspectRatio)
        : _frameSize;
    final scale = _baseScale(frameSize) * _zoom;
    final displayedWidth = image.width * scale;
    final displayedHeight = image.height * scale;
    final left = (frameSize.width - displayedWidth) / 2 + _offset.dx;
    final top = (frameSize.height - displayedHeight) / 2 + _offset.dy;

    final sourceLeft = ((-left) / scale)
        .clamp(0.0, image.width.toDouble())
        .toDouble();
    final sourceTop = ((-top) / scale)
        .clamp(0.0, image.height.toDouble())
        .toDouble();
    final sourceWidth = math
        .min(frameSize.width / scale, image.width - sourceLeft)
        .toDouble();
    final sourceHeight = math
        .min(frameSize.height / scale, image.height - sourceTop)
        .toDouble();
    final source = Rect.fromLTWH(sourceLeft, sourceTop, sourceWidth, sourceHeight);

    const maxOutputDimension = 1600.0;
    final outputScale = math.min(
      maxOutputDimension / source.width,
      maxOutputDimension / source.height,
    );
    final outputWidth = math.max(1, (source.width * outputScale).round());
    final outputHeight = math.max(1, (source.height * outputScale).round());
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawImageRect(
      image,
      source,
      Rect.fromLTWH(0, 0, outputWidth.toDouble(), outputHeight.toDouble()),
      Paint()..filterQuality = FilterQuality.high,
    );
    final picture = recorder.endRecording();
    final outputImage = await picture.toImage(outputWidth, outputHeight);
    final data = await outputImage.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    codec.dispose();
    picture.dispose();
    outputImage.dispose();
    if (data == null) throw StateError('Crop output is empty');

    final outputFile = File(
      '${widget.file.path}.ticketin-crop-${DateTime.now().microsecondsSinceEpoch}.png',
    );
    await outputFile.writeAsBytes(data.buffer.asUint8List(), flush: true);
    return outputFile;
  }

  Widget _buildPreview() {
    final bytes = _bytes;
    if (bytes == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(child: Text(_error!, textAlign: TextAlign.center));
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final frameSize = constraints.biggest;
        _frameSize = frameSize;
        final scale = _baseScale(frameSize) * _zoom;
        final imageWidth = (_imageWidth ?? 1) * scale;
        final imageHeight = (_imageHeight ?? 1) * scale;
        final left = (frameSize.width - imageWidth) / 2 + _offset.dx;
        final top = (frameSize.height - imageHeight) / 2 + _offset.dy;

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onScaleStart: (_) {
            _gestureZoom = _zoom;
          },
          onScaleUpdate: (details) {
            final nextZoom = (_gestureZoom * details.scale).clamp(1.0, 4.0);
            // focalPointDelta is the movement since the previous update, not
            // the total movement since onScaleStart. Accumulate it on the
            // current offset so a zoomed image can be panned across the
            // complete crop frame instead of only moving by the last frame's
            // delta.
            final nextOffset = accumulateCropPanOffset(
              _offset,
              details.focalPointDelta,
            );
            setState(() {
              _zoom = nextZoom;
              _offset = _clampOffset(nextOffset, frameSize, zoom: nextZoom);
            });
          },
          child: ClipRect(
            child: Stack(
              fit: StackFit.expand,
              children: [
                Positioned(
                  left: left,
                  top: top,
                  width: imageWidth,
                  height: imageHeight,
                  child: Image.memory(bytes, fit: BoxFit.fill),
                ),
                IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final previewWidth = math.min(MediaQuery.sizeOf(context).width - 48, 420.0);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Sesuaikan poster',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            const Text('Geser gambar, cubit untuk zoom, lalu gunakan frame sebagai batas poster.'),
            const SizedBox(height: 16),
            SizedBox(
              width: previewWidth,
              child: AspectRatio(
                aspectRatio: widget.aspectRatio,
                child: ColoredBox(color: Colors.black, child: _buildPreview()),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Text('Zoom'),
                Expanded(
                  child: Slider(
                    min: 1,
                    max: 4,
                    value: _zoom,
                    onChanged: _bytes == null
                        ? null
                        : (value) => setState(() {
                            _zoom = value;
                            _offset = _clampOffset(_offset, _frameSize, zoom: value);
                          }),
                  ),
                ),
                IconButton(
                  tooltip: 'Reset crop',
                  onPressed: _bytes == null ? null : _reset,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 4),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
                  child: const Text('Batal'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _bytes == null || _isSaving ? null : _confirm,
                  child: Text(_isSaving ? 'Memproses...' : 'Gunakan'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
