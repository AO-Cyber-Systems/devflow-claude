import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class SampleScreen extends ConsumerWidget {
  const SampleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncVal = ref.watch(sampleProvider);
    return asyncVal.when(
      loading: () => const CircularProgressIndicator(),
      data: (val) => Text(val),
      error: (e, st) => Text('Error: $e'),
    );
  }
}

final sampleProvider = FutureProvider<String>((ref) async {
  return 'Hello';
});
