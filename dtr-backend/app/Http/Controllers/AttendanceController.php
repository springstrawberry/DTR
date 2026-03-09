<?php

namespace App\Http\Controllers;

use App\Models\AttendanceSetting;
use App\Models\DTRBreak;
use App\Models\DTRLog;
use App\Services\AuthService;
use App\Services\DTRLogService;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use LogicException;

class AttendanceController extends Controller
{
    private const ACTIONS = [
        'time_in',
        'morning_break_out',
        'morning_break_in',
        'lunch_out',
        'lunch_in',
        'afternoon_break_out',
        'afternoon_break_in',
        'time_out',
    ];

    public function __construct(
        private readonly AuthService $authService,
        private readonly DTRLogService $dtrLogService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'month' => ['nullable', 'date_format:Y-m'],
        ]);

        $user = $request->user()->loadMissing('attendanceSetting');
        $today = CarbonImmutable::now();
        $selectedMonth = isset($validated['month'])
            ? CarbonImmutable::parse($validated['month'].'-01')->startOfMonth()
            : $today->startOfMonth();

        $monthLogs = $user->dtrLogs()
            ->with('breaks')
            ->whereBetween('date', [
                $selectedMonth->toDateString(),
                $selectedMonth->endOfMonth()->toDateString(),
            ])
            ->orderByDesc('date')
            ->get();

        $todayLog = $user->dtrLogs()
            ->with('breaks')
            ->whereDate('date', $today->toDateString())
            ->first();

        $setting = $user->attendanceSetting;

        return response()->json([
            'user' => $this->authService->serializeUser($user),
            'month' => $selectedMonth->format('Y-m'),
            'settings' => $this->serializeSettings($setting),
            'today' => $this->serializeToday($todayLog, $setting, $today),
            'summary' => $this->serializeSummary($monthLogs, $selectedMonth, $today),
            'records' => $monthLogs
                ->map(fn (DTRLog $log): array => $this->serializeRecord($log, $setting))
                ->values(),
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'morning_break_minutes' => ['required', 'integer', 'min:0', 'max:240'],
            'lunch_break_minutes' => ['required', 'integer', 'min:0', 'max:240'],
            'afternoon_break_minutes' => ['required', 'integer', 'min:0', 'max:240'],
        ]);

        $user = $request->user();

        $setting = AttendanceSetting::query()->updateOrCreate(
            ['user_id' => $user->id],
            $validated,
        );

        $user->setRelation('attendanceSetting', $setting);

        return response()->json([
            'message' => 'Break setup saved.',
            'settings' => $this->serializeSettings($setting->fresh()),
        ]);
    }

    public function store(Request $request, string $action): JsonResponse
    {
        if (! in_array($action, self::ACTIONS, true)) {
            throw ValidationException::withMessages([
                'action' => ['Unsupported attendance action.'],
            ]);
        }

        $user = $request->user()->loadMissing('attendanceSetting');

        try {
            $todayLog = match ($action) {
                'time_in' => $this->dtrLogService->timeIn($user),
                'morning_break_out' => $this->afterBreakAction(
                    $this->dtrLogService->breakOut($user, 'morning_break')
                ),
                'morning_break_in' => $this->afterBreakAction(
                    $this->dtrLogService->breakIn($user, 'morning_break')
                ),
                'lunch_out' => $this->afterBreakAction(
                    $this->dtrLogService->breakOut($user, 'lunch')
                ),
                'lunch_in' => $this->afterBreakAction(
                    $this->dtrLogService->breakIn($user, 'lunch')
                ),
                'afternoon_break_out' => $this->afterBreakAction(
                    $this->dtrLogService->breakOut($user, 'afternoon_break')
                ),
                'afternoon_break_in' => $this->afterBreakAction(
                    $this->dtrLogService->breakIn($user, 'afternoon_break')
                ),
                'time_out' => $this->dtrLogService->timeOut($user),
            };
        } catch (LogicException $exception) {
            throw ValidationException::withMessages([
                'action' => [$exception->getMessage()],
            ]);
        }

        $todayLog = $todayLog->fresh()->load('breaks');

        return response()->json([
            'message' => $this->actionMessage($action),
            'record' => $this->serializeRecord($todayLog, $user->attendanceSetting),
            'today' => $this->serializeToday($todayLog, $user->attendanceSetting, CarbonImmutable::now()),
        ]);
    }

    private function afterBreakAction(DTRBreak $break): DTRLog
    {
        return $break->dtrLog()->with('breaks')->firstOrFail();
    }

    private function serializeSettings(?AttendanceSetting $setting): array
    {
        if ($setting === null) {
            return [
                'configured' => false,
                'morning_break_minutes' => 0,
                'lunch_break_minutes' => 0,
                'afternoon_break_minutes' => 0,
                'breaks' => $this->defaultBreakDefinitions(),
            ];
        }

        return [
            'configured' => true,
            'morning_break_minutes' => (int) $setting->morning_break_minutes,
            'lunch_break_minutes' => (int) $setting->lunch_break_minutes,
            'afternoon_break_minutes' => (int) $setting->afternoon_break_minutes,
            'breaks' => array_map(
                static fn (array $definition): array => [
                    'type' => $definition['type'],
                    'label' => $definition['label'],
                    'allowed_minutes' => $definition['allowed_minutes'],
                    'enabled' => $definition['enabled'],
                ],
                $setting->breakDefinitions()
            ),
        ];
    }

    private function defaultBreakDefinitions(): array
    {
        $definitions = [];

        foreach (AttendanceSetting::BREAK_TYPES as $type => $meta) {
            $definitions[] = [
                'type' => $type,
                'label' => $meta['label'],
                'allowed_minutes' => 0,
                'enabled' => false,
            ];
        }

        return $definitions;
    }

    private function serializeToday(
        ?DTRLog $log,
        ?AttendanceSetting $setting,
        CarbonInterface $today,
    ): array {
        $todayBreaks = $this->serializeTodayBreaks($log, $setting);
        $openBreak = collect($todayBreaks)->firstWhere('status', 'on_break');
        $pendingRequiredBreak = collect($todayBreaks)
            ->filter(static fn (array $break): bool => $break['enabled'])
            ->first(fn (array $break): bool => in_array($break['status'], ['not_started', 'on_break'], true));

        $status = 'not_started';

        if ($openBreak !== null) {
            $status = 'on_break';
        } elseif ($log?->time_out !== null) {
            $status = 'completed';
        } elseif ($log?->time_in !== null) {
            $status = 'in_progress';
        }

        return [
            'date' => $today->toDateString(),
            'status' => $status,
            'setup_required' => $setting === null,
            'time_in' => $log?->time_in?->toIso8601String(),
            'time_out' => $log?->time_out?->toIso8601String(),
            'can_clock_in' => $setting !== null && ($log === null || $log->time_in === null),
            'can_clock_out' => $setting !== null
                && $log !== null
                && $log->time_in !== null
                && $log->time_out === null
                && $openBreak === null
                && $pendingRequiredBreak === null,
            'breaks' => $todayBreaks,
        ];
    }

    private function serializeTodayBreaks(?DTRLog $log, ?AttendanceSetting $setting): array
    {
        if ($setting === null) {
            return array_map(static fn (array $definition): array => [
                'type' => $definition['type'],
                'label' => $definition['label'],
                'enabled' => false,
                'allowed_minutes' => 0,
                'break_out' => null,
                'break_in' => null,
                'actual_minutes' => null,
                'exceeded_minutes' => 0,
                'status' => 'disabled',
                'can_start' => false,
                'can_end' => false,
            ], $this->defaultBreakDefinitions());
        }

        $breakDefinitions = $setting->breakDefinitions();
        $breaksByType = $log?->breaks?->keyBy('break_type') ?? collect();
        $enabledTypes = $setting?->configuredBreakTypes() ?? [];
        $nextPendingType = $this->nextPendingBreakType($log, $enabledTypes);
        $activeBreak = $log?->breaks?->first(
            static fn (DTRBreak $break): bool => $break->break_out !== null && $break->break_in === null
        );

        $serialized = [];

        foreach ($breakDefinitions as $definition) {
            $type = $definition['type'];
            $record = $breaksByType->get($type);
            $status = 'disabled';

            if ($definition['enabled']) {
                if ($record?->break_in !== null) {
                    $status = 'completed';
                } elseif ($record?->break_out !== null) {
                    $status = 'on_break';
                } else {
                    $status = 'not_started';
                }
            }

            $serialized[] = [
                'type' => $type,
                'label' => $definition['label'],
                'enabled' => $definition['enabled'],
                'allowed_minutes' => $definition['allowed_minutes'],
                'break_out' => $record?->break_out?->toIso8601String(),
                'break_in' => $record?->break_in?->toIso8601String(),
                'actual_minutes' => $this->calculateActualBreakMinutes($record),
                'exceeded_minutes' => (int) ($record?->exceeded_minutes ?? 0),
                'status' => $status,
                'can_start' => $definition['enabled']
                    && $setting !== null
                    && $log !== null
                    && $log->time_in !== null
                    && $log->time_out === null
                    && $activeBreak === null
                    && $record === null
                    && $nextPendingType === $type,
                'can_end' => $definition['enabled']
                    && $activeBreak !== null
                    && $activeBreak->break_type === $type,
            ];
        }

        return $serialized;
    }

    private function serializeSummary(
        Collection $logs,
        CarbonImmutable $selectedMonth,
        CarbonImmutable $today,
    ): array {
        $clockInMinutes = $logs
            ->pluck('time_in')
            ->filter()
            ->map(fn (CarbonInterface $time): int => $time->hour * 60 + $time->minute)
            ->values();

        $clockOutMinutes = $logs
            ->pluck('time_out')
            ->filter()
            ->map(fn (CarbonInterface $time): int => $time->hour * 60 + $time->minute)
            ->values();

        $workingMinutes = $logs
            ->map(fn (DTRLog $log): int => $this->calculateWorkedMinutes($log))
            ->filter(static fn (int $minutes): bool => $minutes > 0)
            ->values();

        $attendanceDays = $logs
            ->filter(static fn (DTRLog $log): bool => $log->time_in !== null)
            ->count();

        return [
            'average_clock_in_minutes' => $this->averageMinutes($clockInMinutes),
            'average_clock_out_minutes' => $this->averageMinutes($clockOutMinutes),
            'average_working_minutes' => $this->averageMinutes($workingMinutes) ?? 0,
            'absent_days' => max(
                0,
                $this->countExpectedWeekdays($selectedMonth, $today) - $attendanceDays
            ),
        ];
    }

    private function serializeRecord(DTRLog $log, ?AttendanceSetting $setting): array
    {
        $breaks = $setting !== null
            ? $this->serializeRecordBreaks($log, $setting)
            : [];

        return [
            'id' => $log->id,
            'date' => $log->date?->toDateString(),
            'time_in' => $log->time_in?->toIso8601String(),
            'time_out' => $log->time_out?->toIso8601String(),
            'working_minutes' => $this->calculateWorkedMinutes($log),
            'break_exceeded_minutes' => array_sum(
                array_map(static fn (array $break): int => $break['exceeded_minutes'], $breaks)
            ),
            'breaks' => $breaks,
        ];
    }

    private function serializeRecordBreaks(DTRLog $log, AttendanceSetting $setting): array
    {
        $breaksByType = $log->breaks->keyBy('break_type');
        $serialized = [];

        foreach ($setting->breakDefinitions() as $definition) {
            $record = $breaksByType->get($definition['type']);

            if ($record === null) {
                continue;
            }

            $serialized[] = [
                'type' => $definition['type'],
                'label' => $definition['label'],
                'allowed_minutes' => $record->allowed_minutes,
                'actual_minutes' => $this->calculateActualBreakMinutes($record),
                'exceeded_minutes' => $record->exceeded_minutes,
                'break_out' => $record->break_out?->toIso8601String(),
                'break_in' => $record->break_in?->toIso8601String(),
            ];
        }

        return $serialized;
    }

    private function calculateActualBreakMinutes(?DTRBreak $break): ?int
    {
        if ($break?->break_out === null || $break->break_in === null) {
            return null;
        }

        return max(0, $break->break_out->diffInMinutes($break->break_in, false));
    }

    private function nextPendingBreakType(?DTRLog $log, array $enabledTypes): ?string
    {
        if ($log === null) {
            return $enabledTypes[0] ?? null;
        }

        $breaksByType = $log->breaks->keyBy('break_type');

        foreach ($enabledTypes as $type) {
            $record = $breaksByType->get($type);

            if ($record === null || $record->break_in === null) {
                return $type;
            }
        }

        return null;
    }

    private function calculateWorkedMinutes(DTRLog $log): int
    {
        return (int) round($this->dtrLogService->calculateTotalHours([$log]) * 60);
    }

    private function averageMinutes(Collection $values): ?int
    {
        if ($values->isEmpty()) {
            return null;
        }

        return (int) round($values->sum() / $values->count());
    }

    private function countExpectedWeekdays(
        CarbonImmutable $selectedMonth,
        CarbonImmutable $today,
    ): int {
        $monthStart = $selectedMonth->startOfMonth();

        if ($monthStart->greaterThan($today->startOfMonth())) {
            return 0;
        }

        $monthEnd = $selectedMonth->isSameMonth($today)
            ? $today
            : $selectedMonth->endOfMonth();

        $count = 0;
        $cursor = $monthStart;

        while ($cursor->lessThanOrEqualTo($monthEnd)) {
            if (! $cursor->isWeekend()) {
                $count++;
            }

            $cursor = $cursor->addDay();
        }

        return $count;
    }

    private function actionMessage(string $action): string
    {
        return match ($action) {
            'time_in' => 'Clock in recorded.',
            'morning_break_out' => 'Before lunch break started.',
            'morning_break_in' => 'Before lunch break ended.',
            'lunch_out' => 'Lunch break started.',
            'lunch_in' => 'Lunch break ended.',
            'afternoon_break_out' => 'After lunch break started.',
            'afternoon_break_in' => 'After lunch break ended.',
            'time_out' => 'Clock out recorded.',
        };
    }
}
