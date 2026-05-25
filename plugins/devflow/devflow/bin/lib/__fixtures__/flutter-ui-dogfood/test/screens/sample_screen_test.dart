import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Helper that exercises the AsyncValue.when full coverage shape.
// This is the literal `.when(loading: ..., data: ..., error: ...)` pattern that
// the state-coverage verifier's `when_all_three` (HIGH confidence) regex matches.
Widget renderAsync(AsyncValue<String> v) => v.when(
      loading: () => const CircularProgressIndicator(),
      data: (val) => Text(val),
      error: (e, st) => Text('Error: $e'),
    );

void main() {
  testWidgets('renders loading state', (tester) async {
    await tester.pumpWidget(MaterialApp(home: renderAsync(const AsyncValue.loading())));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('renders data state', (tester) async {
    await tester.pumpWidget(MaterialApp(home: renderAsync(const AsyncValue.data('hello'))));
    expect(find.text('hello'), findsOneWidget);
  });

  testWidgets('renders error state', (tester) async {
    await tester.pumpWidget(MaterialApp(home: renderAsync(AsyncValue.error(Exception('boom'), StackTrace.empty))));
    expect(find.textContaining('Error'), findsOneWidget);
  });
}
