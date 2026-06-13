// Fixture: Full Riverpod AsyncValue.when coverage
// Coverage: loading + data + error branches all present in one .when() call.
// This fixture is intentionally minimal — it represents the canonical pattern
// that the `when_all_three` HIGH-confidence regex should match.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders all AsyncValue states', (tester) async {
    // Simulates a widget that uses AsyncValue.when with all three branches.
    final asyncVal = AsyncValue.data('hello');

    asyncVal.when(
      loading: () => CircularProgressIndicator(),
      data: (val) => Text(val),
      error: (e, st) => ErrorView(e),
    );

    // Widget under test wraps a ConsumerWidget using the same pattern.
    await tester.pumpWidget(
      ProviderScope(
        overrides: [],
        child: MaterialApp(home: Scaffold(body: Container())),
      ),
    );
    await tester.pump();
  });
}

class ErrorView extends StatelessWidget {
  final Object error;
  const ErrorView(this.error, {super.key});
  @override
  Widget build(BuildContext context) => Text('Error: $error');
}
