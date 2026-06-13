// Fixture: Full flutter_bloc coverage — switch-based sealed-class states
// Coverage: MyLoadingState (loading), MyLoadedState (data), MyErrorState (error)
// Each state name follows the conventional XxxLoading/XxxLoaded/XxxError pattern
// that the bloc_loading_state, bloc_loaded_data_state, bloc_error_state HIGH-confidence
// regex patterns target.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders all Bloc states via switch', (tester) async {
    await tester.pumpWidget(
      BlocProvider<MyBloc>(
        create: (_) => MyBloc(),
        child: MaterialApp(
          home: Scaffold(
            body: BlocBuilder<MyBloc, MyState>(
              builder: (ctx, state) {
                switch (state) {
                  case MyLoadingState():
                    return Spinner();
                  case MyLoadedState(:final data):
                    return Text(data);
                  case MyErrorState():
                    return ErrorView();
                }
              },
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(Spinner), findsOneWidget);
  });
}

// Minimal stub types so the file parses as valid Dart
class MyBloc extends Bloc<Object, MyState> {
  MyBloc() : super(MyLoadingState());
}

sealed class MyState {}
class MyLoadingState extends MyState {}
class MyLoadedState extends MyState {
  final String data;
  MyLoadedState(this.data);
}
class MyErrorState extends MyState {}

class Spinner extends StatelessWidget {
  const Spinner({super.key});
  @override
  Widget build(BuildContext context) => const CircularProgressIndicator();
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key});
  @override
  Widget build(BuildContext context) => const Text('Error');
}
