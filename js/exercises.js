// Built-in exercise library. Ids are permanent: workout history refers to them.
// Rename freely, but never change or reuse an id.
const L = (muscleGroup, items) => items.map(([id, name]) => ({ id, name, muscleGroup, isCustom: false }));

export const LIBRARY = [
  ...L('Chest', [
    ['barbell-bench-press', 'Barbell Bench Press'], ['incline-barbell-bench-press', 'Incline Barbell Bench Press'],
    ['dumbbell-bench-press', 'Dumbbell Bench Press'], ['incline-dumbbell-press', 'Incline Dumbbell Press'],
    ['machine-chest-press', 'Machine Chest Press'], ['smith-machine-bench-press', 'Smith Machine Bench Press'],
    ['cable-fly', 'Cable Fly'], ['pec-deck', 'Pec Deck'], ['dumbbell-fly', 'Dumbbell Fly'],
  ]),
  ...L('Back', [
    ['lat-pulldown', 'Lat Pulldown'], ['pull-up', 'Pull-Up'], ['assisted-pull-up', 'Assisted Pull-Up'],
    ['barbell-row', 'Barbell Row'], ['dumbbell-row', 'Dumbbell Row'], ['chest-supported-row', 'Chest Supported Row'],
    ['seated-cable-row', 'Seated Cable Row'], ['machine-row', 'Machine Row'], ['straight-arm-pulldown', 'Straight-Arm Pulldown'],
  ]),
  ...L('Shoulders', [
    ['overhead-press', 'Overhead Press'], ['dumbbell-shoulder-press', 'Dumbbell Shoulder Press'],
    ['machine-shoulder-press', 'Machine Shoulder Press'], ['dumbbell-lateral-raise', 'Dumbbell Lateral Raise'],
    ['cable-lateral-raise', 'Cable Lateral Raise'], ['machine-lateral-raise', 'Machine Lateral Raise'],
    ['rear-delt-fly', 'Rear Delt Fly'], ['face-pull', 'Face Pull'],
  ]),
  ...L('Biceps', [
    ['barbell-curl', 'Barbell Curl'], ['dumbbell-curl', 'Dumbbell Curl'], ['hammer-curl', 'Hammer Curl'],
    ['preacher-curl', 'Preacher Curl'], ['cable-curl', 'Cable Curl'], ['incline-dumbbell-curl', 'Incline Dumbbell Curl'],
  ]),
  ...L('Triceps', [
    ['triceps-pushdown', 'Triceps Pushdown'], ['rope-pushdown', 'Rope Pushdown'],
    ['overhead-cable-extension', 'Overhead Cable Extension'], ['skull-crusher', 'Skull Crusher'],
    ['close-grip-bench-press', 'Close-Grip Bench Press'], ['dip', 'Dip'],
  ]),
  ...L('Quads', [
    ['back-squat', 'Back Squat'], ['front-squat', 'Front Squat'], ['hack-squat', 'Hack Squat'],
    ['leg-press', 'Leg Press'], ['leg-extension', 'Leg Extension'],
    ['bulgarian-split-squat', 'Bulgarian Split Squat'], ['walking-lunge', 'Walking Lunge'],
  ]),
  ...L('Hamstrings / Glutes', [
    ['romanian-deadlift', 'Romanian Deadlift'], ['stiff-leg-deadlift', 'Stiff-Leg Deadlift'],
    ['seated-leg-curl', 'Seated Leg Curl'], ['lying-leg-curl', 'Lying Leg Curl'],
    ['hip-thrust', 'Hip Thrust'], ['glute-bridge', 'Glute Bridge'],
  ]),
  ...L('Calves', [
    ['standing-calf-raise', 'Standing Calf Raise'], ['seated-calf-raise', 'Seated Calf Raise'],
    ['leg-press-calf-raise', 'Leg Press Calf Raise'],
  ]),
  ...L('Abs', [
    ['cable-crunch', 'Cable Crunch'], ['hanging-leg-raise', 'Hanging Leg Raise'],
    ['machine-crunch', 'Machine Crunch'], ['ab-wheel', 'Ab Wheel'],
  ]),
];

export const LIBRARY_IDS = new Set(LIBRARY.map((e) => e.id));
