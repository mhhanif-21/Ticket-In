import 'dart:ui' as ui;

import 'package:flutter/material.dart';

double resolveEventImageAspectRatio({
  required double? intrinsicAspectRatio,
  required double? frameAspectRatio,
  double fallbackAspectRatio = 16 / 9,
}) {
  final selectedRatio =
      frameAspectRatio ?? intrinsicAspectRatio ?? fallbackAspectRatio;
  return selectedRatio.isFinite && selectedRatio > 0
      ? selectedRatio
      : fallbackAspectRatio;
}

/// Renders an event image without distorting or cropping its source content.
///
/// When no fixed frame is requested, the widget learns the image's intrinsic
/// ratio from the ImageStream and updates its height through AspectRatio. A
/// fixed frame can opt into a blurred backdrop so the foreground image stays
/// fully visible without leaving an empty gutter.
class AdaptiveEventImage extends StatefulWidget {
  final ImageProvider image;
  final double? frameAspectRatio;
  final double fallbackAspectRatio;
  final BoxFit fit;
  final bool blurredBackdrop;
  final bool expand;
  final Color backgroundColor;
  final BorderRadius borderRadius;
  final ImageErrorWidgetBuilder? errorBuilder;

  const AdaptiveEventImage({
    super.key,
    required this.image,
    this.frameAspectRatio,
    this.fallbackAspectRatio = 16 / 9,
    this.fit = BoxFit.contain,
    this.blurredBackdrop = false,
    this.expand = false,
    this.backgroundColor = Colors.transparent,
    this.borderRadius = BorderRadius.zero,
    this.errorBuilder,
  });

  @override
  State<AdaptiveEventImage> createState() => _AdaptiveEventImageState();
}

class _AdaptiveEventImageState extends State<AdaptiveEventImage> {
  ImageStream? _imageStream;
  ImageStreamListener? _imageStreamListener;
  double? _intrinsicAspectRatio;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolveImage();
  }

  @override
  void didUpdateWidget(covariant AdaptiveEventImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.image != widget.image) {
      _resolveImage();
    }
  }

  void _resolveImage() {
    _removeImageListener();
    _intrinsicAspectRatio = null;

    final stream = widget.image.resolve(createLocalImageConfiguration(context));
    final listener = ImageStreamListener((imageInfo, _) {
      final width = imageInfo.image.width;
      final height = imageInfo.image.height;
      if (!mounted ||
          width <= 0 ||
          height <= 0 ||
          widget.frameAspectRatio != null) {
        return;
      }

      final ratio = width / height;
      if (_intrinsicAspectRatio != ratio) {
        setState(() => _intrinsicAspectRatio = ratio);
      }
    });

    _imageStream = stream;
    _imageStreamListener = listener;
    stream.addListener(listener);
  }

  void _removeImageListener() {
    final stream = _imageStream;
    final listener = _imageStreamListener;
    if (stream != null && listener != null) {
      stream.removeListener(listener);
    }
    _imageStream = null;
    _imageStreamListener = null;
  }

  @override
  void dispose() {
    _removeImageListener();
    super.dispose();
  }

  Widget _buildImage({required BoxFit fit}) {
    return Image(
      image: widget.image,
      fit: fit,
      filterQuality: FilterQuality.medium,
      errorBuilder:
          widget.errorBuilder ??
          (context, error, stackTrace) {
            return const Center(child: Icon(Icons.broken_image_outlined));
          },
    );
  }

  Widget _buildContent() {
    final foreground = _buildImage(fit: widget.fit);
    if (!widget.blurredBackdrop) return foreground;

    return Stack(
      fit: StackFit.expand,
      children: [
        ImageFiltered(
          imageFilter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: ColorFiltered(
            colorFilter: ColorFilter.mode(
              Colors.black.withValues(alpha: 0.18),
              BlendMode.darken,
            ),
            child: _buildImage(fit: BoxFit.cover),
          ),
        ),
        foreground,
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final content = widget.expand
        ? SizedBox.expand(child: _buildContent())
        : AspectRatio(
            aspectRatio: resolveEventImageAspectRatio(
              intrinsicAspectRatio: _intrinsicAspectRatio,
              frameAspectRatio: widget.frameAspectRatio,
              fallbackAspectRatio: widget.fallbackAspectRatio,
            ),
            child: _buildContent(),
          );

    return ClipRRect(
      borderRadius: widget.borderRadius,
      child: ColoredBox(color: widget.backgroundColor, child: content),
    );
  }
}
