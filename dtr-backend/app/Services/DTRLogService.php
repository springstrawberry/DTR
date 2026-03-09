<?php

namespace App\Services;

use App\Models\AttendanceSetting;
use App\Models\DTRBreak;
use App\Models\DTRLog;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use LogicException;

class DTRLogService
{
    public function timeIn(User $user, mixed $recordedAt = null): DTRLog
    {
        $setting = $this->getAttendanceSetting($user);
        $this->ensureScheduleIsConfigured($setting);

        $recordedAt = $this->resolveTimestamp($recordedAt);
        $log = $this->getOrCreateDailyLog($user, $setting, $recordedAt);
        $this->ensureClockInBeforeAbsenceCutoff($setting, $recordedAt, $log);

        $this->ensureFieldIsEmpty($log, 'time_in', 'Time in has already been recorded for this date.');

        $log->time_in = $recordedAt;
        $log->save();

        return $log->refresh()->load('breaks');
    }

    public function breakOut(User $user, string $breakType, mixed $recordedAt = null): DTRBreak
    {
        $setting = $this->getAttendanceSetting($user);
        $recordedAt = $this->resolveTimestamp($recordedAt);
        $log = $this->getExistingDailyLog($user, $setting, $recordedAt, 'Cannot record a break before time in.')
            ->loadMissing('breaks');

        $label = AttendanceSetting::labelFor($breakType);

        $this->ensureBreakIsEnabled($setting, $breakType);
        $this->ensureFieldIsPresent($log, 'time_in', 'Cannot record a break before time in.');
        $this->ensureFieldIsEmpty($log, 'time_out', 'Cannot record a break after time out.');
        $this->ensureNoActiveBreak($log);
        $this->ensureBreakIsNext($log, $setting, $breakType);
        $this->ensureBreakHasNotBeenRecorded($log, $breakType, "{$label} has already been recorded for this date.");
        $this->ensureChronologicalOrder(
            $recordedAt,
            $this->latestRecordedTimestamp($log),
            "{$label} cannot be earlier than the previous attendance action."
        );

        $break = $log->breaks()->create([
            'break_type' => $breakType,
            'break_out' => $recordedAt,
            'allowed_minutes' => $setting->allowedMinutesFor($breakType),
            'exceeded_minutes' => 0,
        ]);

        return $break->refresh();
    }

    public function breakIn(User $user, string $breakType, mixed $recordedAt = null): DTRBreak
    {
        $setting = $this->getAttendanceSetting($user);
        $recordedAt = $this->resolveTimestamp($recordedAt);
        $log = $this->getExistingDailyLog($user, $setting, $recordedAt, 'Cannot end a break before time in.')
            ->loadMissing('breaks');

        $label = AttendanceSetting::labelFor($breakType);

        $this->ensureBreakIsEnabled($setting, $breakType);
        $this->ensureFieldIsPresent($log, 'time_in', 'Cannot end a break before time in.');
        $this->ensureFieldIsEmpty($log, 'time_out', 'Cannot end a break after time out.');

        $activeBreak = $this->getActiveBreak($log);

        if ($activeBreak === null) {
            throw new LogicException("Cannot record {$label} in before {$label} out.");
        }

        if ($activeBreak->break_type !== $breakType) {
            $activeLabel = AttendanceSetting::labelFor($activeBreak->break_type);
            throw new LogicException("Cannot end {$label} before ending {$activeLabel}.");
        }

        $this->ensureChronologicalOrder(
            $recordedAt,
            $activeBreak->break_out,
            "{$label} in cannot be earlier than {$label} out."
        );

        $actualMinutes = max(0, $activeBreak->break_out?->diffInMinutes($recordedAt, false) ?? 0);

        $activeBreak->forceFill([
            'break_in' => $recordedAt,
            'allowed_minutes' => $setting->allowedMinutesFor($breakType),
            'exceeded_minutes' => max(0, $actualMinutes - $setting->allowedMinutesFor($breakType)),
        ])->save();

        return $activeBreak->refresh();
    }

    public function timeOut(User $user, mixed $recordedAt = null): DTRLog
    {
        $setting = $this->getAttendanceSetting($user);

        $recordedAt = $this->resolveTimestamp($recordedAt);
        $log = $this->getExistingDailyLog($user, $setting, $recordedAt, 'Cannot record time out before time in.')
            ->loadMissing('breaks');

        $this->ensureFieldIsPresent($log, 'time_in', 'Cannot record time out before time in.');
        $this->ensureFieldIsEmpty($log, 'time_out', 'Time out has already been recorded for this date.');

        $activeBreak = $this->getActiveBreak($log);

        if ($activeBreak !== null) {
            $label = AttendanceSetting::labelFor($activeBreak->break_type);
            throw new LogicException("Cannot record time out while {$label} is active.");
        }

        $pendingBreak = $this->nextPendingBreakType($log, $setting);

        if ($pendingBreak !== null) {
            $label = AttendanceSetting::labelFor($pendingBreak);
            throw new LogicException("Complete {$label} before time out.");
        }

        $this->ensureChronologicalOrder(
            $recordedAt,
            $this->latestRecordedTimestamp($log),
            'Time out cannot be earlier than the previous attendance action.'
        );

        $log->time_out = $recordedAt;
        $log->save();

        return $log->refresh()->load('breaks');
    }

    public function calculateTotalHours(iterable $dtrLogs): float
    {
        $totalHours = 0.0;

        foreach ($dtrLogs as $log) {
            $timeIn = $this->valueFromLog($log, 'time_in');
            $timeOut = $this->valueFromLog($log, 'time_out');

            if ($timeIn === null || $timeOut === null) {
                continue;
            }

            $workedMinutes = max(
                0,
                $this->asCarbon($timeIn)->diffInMinutes($this->asCarbon($timeOut), false)
                    - $this->calculateBreakMinutes($log)
            );

            $totalHours += $workedMinutes / 60;
        }

        return $totalHours;
    }

    private function calculateBreakMinutes(mixed $log): int
    {
        $totalMinutes = 0;

        foreach ($this->extractBreaks($log) as $break) {
            $breakOut = $this->valueFromLog($break, 'break_out');
            $breakIn = $this->valueFromLog($break, 'break_in');

            if ($breakOut === null || $breakIn === null) {
                continue;
            }

            $totalMinutes += max(
                0,
                $this->asCarbon($breakOut)->diffInMinutes($this->asCarbon($breakIn), false)
            );
        }

        if ($totalMinutes > 0) {
            return $totalMinutes;
        }

        $lunchOut = $this->valueFromLog($log, 'lunch_out');
        $lunchIn = $this->valueFromLog($log, 'lunch_in');

        if ($lunchOut === null || $lunchIn === null) {
            return 0;
        }

        return max(
            0,
            $this->asCarbon($lunchOut)->diffInMinutes($this->asCarbon($lunchIn), false)
        );
    }

    private function extractBreaks(mixed $log): iterable
    {
        $breaks = $this->valueFromLog($log, 'breaks');

        if ($breaks instanceof Collection) {
            return $breaks->all();
        }

        if (is_iterable($breaks)) {
            return $breaks;
        }

        return [];
    }

    private function valueFromLog(mixed $target, string $field): mixed
    {
        if (is_array($target)) {
            return $target[$field] ?? null;
        }

        if (is_object($target) && isset($target->{$field})) {
            return $target->{$field};
        }

        if (is_object($target) && property_exists($target, $field)) {
            return $target->{$field};
        }

        return null;
    }

    private function ensureBreakIsEnabled(AttendanceSetting $setting, string $breakType): void
    {
        if ($setting->allowedMinutesFor($breakType) <= 0) {
            $label = AttendanceSetting::labelFor($breakType);
            throw new LogicException("{$label} is not enabled in your break setup.");
        }
    }

    private function ensureScheduleIsConfigured(AttendanceSetting $setting): void
    {
        if ($setting->hasScheduleSetup()) {
            return;
        }

        throw new LogicException('Configure your work schedule before recording attendance.');
    }

    private function ensureNoActiveBreak(DTRLog $log): void
    {
        $activeBreak = $this->getActiveBreak($log);

        if ($activeBreak === null) {
            return;
        }

        $label = AttendanceSetting::labelFor($activeBreak->break_type);
        throw new LogicException("Cannot start another break while {$label} is active.");
    }

    private function ensureBreakIsNext(DTRLog $log, AttendanceSetting $setting, string $breakType): void
    {
        $expectedBreakType = $this->nextPendingBreakType($log, $setting);

        if ($expectedBreakType === null) {
            throw new LogicException('All configured breaks have already been recorded for this date.');
        }

        if ($expectedBreakType === $breakType) {
            return;
        }

        $label = AttendanceSetting::labelFor($expectedBreakType);
        throw new LogicException("{$label} must be recorded next.");
    }

    private function nextPendingBreakType(DTRLog $log, AttendanceSetting $setting): ?string
    {
        $recordedBreaks = $log->breaks->keyBy('break_type');

        foreach ($setting->configuredBreakTypes() as $type) {
            $record = $recordedBreaks->get($type);

            if ($record === null || $record->break_in === null) {
                return $type;
            }
        }

        return null;
    }

    private function ensureBreakHasNotBeenRecorded(DTRLog $log, string $breakType, string $message): void
    {
        if ($log->breaks->contains(static fn (DTRBreak $break): bool => $break->break_type === $breakType)) {
            throw new LogicException($message);
        }
    }

    private function latestRecordedTimestamp(DTRLog $log): CarbonInterface
    {
        $timestamps = collect([$log->time_in, $log->time_out])
            ->merge($log->breaks->pluck('break_out'))
            ->merge($log->breaks->pluck('break_in'))
            ->filter()
            ->map(fn (mixed $timestamp): CarbonInterface => $this->asCarbon($timestamp))
            ->sortBy(fn (CarbonInterface $timestamp): int => $timestamp->getTimestamp());

        return $timestamps->last() ?? $this->asCarbon($log->time_in ?? now());
    }

    private function getActiveBreak(DTRLog $log): ?DTRBreak
    {
        return $log->breaks
            ->first(static fn (DTRBreak $break): bool => $break->break_out !== null && $break->break_in === null);
    }

    private function getAttendanceSetting(User $user): AttendanceSetting
    {
        $this->ensureUserExists($user);

        $setting = $user->relationLoaded('attendanceSetting')
            ? $user->getRelation('attendanceSetting')
            : $user->attendanceSetting()->first();

        if ($setting === null) {
            throw new LogicException('Configure your attendance setup before recording attendance.');
        }

        return $setting;
    }

    private function asCarbon(mixed $value): CarbonInterface
    {
        return $value instanceof CarbonInterface ? $value : Carbon::parse($value);
    }

    private function resolveTimestamp(mixed $value): CarbonInterface
    {
        return $this->asCarbon($value ?? Carbon::now());
    }

    private function getOrCreateDailyLog(User $user, AttendanceSetting $setting, CarbonInterface $recordedAt): DTRLog
    {
        $this->ensureUserExists($user);
        $logDate = $this->resolveLogDate($user, $setting, $recordedAt);

        $log = $user->dtrLogs()
            ->whereDate('date', $logDate->toDateString())
            ->first();

        if ($log !== null) {
            return $log;
        }

        return $user->dtrLogs()->make([
            'date' => Carbon::parse($logDate->toDateString())->startOfDay(),
        ]);
    }

    private function getExistingDailyLog(
        User $user,
        AttendanceSetting $setting,
        CarbonInterface $recordedAt,
        string $message,
    ): DTRLog
    {
        $this->ensureUserExists($user);
        $logDate = $this->resolveLogDate($user, $setting, $recordedAt);

        $log = $user->dtrLogs()
            ->whereDate('date', $logDate->toDateString())
            ->first();

        if ($log === null) {
            throw new LogicException($message);
        }

        return $log;
    }

    private function ensureUserExists(User $user): void
    {
        if (! $user->exists) {
            throw new LogicException('User must be saved before recording DTR actions.');
        }
    }

    private function ensureFieldIsPresent(DTRLog $log, string $field, string $message): void
    {
        if ($log->{$field} === null) {
            throw new LogicException($message);
        }
    }

    private function ensureFieldIsEmpty(DTRLog $log, string $field, string $message): void
    {
        if ($log->{$field} !== null) {
            throw new LogicException($message);
        }
    }

    private function ensureChronologicalOrder(CarbonInterface $current, mixed $previous, string $message): void
    {
        if ($this->asCarbon($previous)->greaterThan($current)) {
            throw new LogicException($message);
        }
    }

    private function ensureClockInBeforeAbsenceCutoff(
        AttendanceSetting $setting,
        CarbonInterface $recordedAt,
        DTRLog $log,
    ): void {
        if ($log->date === null || Carbon::parse($log->date->toDateString())->isWeekend()) {
            return;
        }

        $cutoff = $setting->absenceCutoffForDate($log->date);

        if ($cutoff !== null && $recordedAt->greaterThanOrEqualTo($cutoff)) {
            throw new LogicException('You are already marked absent for this shift.');
        }
    }

    private function resolveLogDate(
        User $user,
        AttendanceSetting $setting,
        CarbonInterface $recordedAt,
    ): CarbonInterface {
        $baseDate = Carbon::parse($recordedAt->toDateString())->startOfDay();

        if (! $setting->isOvernightSchedule()) {
            return $baseDate;
        }

        $previousDate = $baseDate->copy()->subDay();
        $previousLog = $user->dtrLogs()
            ->whereDate('date', $previousDate->toDateString())
            ->first();

        if ($previousLog !== null && $previousLog->time_in !== null && $previousLog->time_out === null) {
            return $previousDate;
        }

        $shiftEnd = $setting->formattedShiftEndTime();

        if ($shiftEnd !== null && $recordedAt->format('H:i') <= $shiftEnd) {
            return $previousDate;
        }

        return $baseDate;
    }
}
