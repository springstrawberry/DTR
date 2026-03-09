<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use InvalidArgumentException;

class AttendanceSetting extends Model
{
    public const BREAK_TYPES = [
        'morning_break' => [
            'label' => 'Before lunch break',
            'field' => 'morning_break_minutes',
            'sequence' => 1,
        ],
        'lunch' => [
            'label' => 'Lunch break',
            'field' => 'lunch_break_minutes',
            'sequence' => 2,
        ],
        'afternoon_break' => [
            'label' => 'After lunch break',
            'field' => 'afternoon_break_minutes',
            'sequence' => 3,
        ],
    ];

    protected $fillable = [
        'user_id',
        'morning_break_minutes',
        'lunch_break_minutes',
        'afternoon_break_minutes',
        'shift_start_time',
        'shift_end_time',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'morning_break_minutes' => 'integer',
            'lunch_break_minutes' => 'integer',
            'afternoon_break_minutes' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function breakDefinitions(): array
    {
        $definitions = [];

        foreach (self::BREAK_TYPES as $type => $meta) {
            $minutes = (int) $this->{$meta['field']};

            $definitions[] = [
                'type' => $type,
                'label' => $meta['label'],
                'field' => $meta['field'],
                'sequence' => $meta['sequence'],
                'allowed_minutes' => $minutes,
                'enabled' => $minutes > 0,
            ];
        }

        return $definitions;
    }

    public function allowedMinutesFor(string $type): int
    {
        return (int) $this->{self::metaFor($type)['field']};
    }

    public function configuredBreakTypes(): array
    {
        $types = [];

        foreach ($this->breakDefinitions() as $definition) {
            if ($definition['enabled']) {
                $types[] = $definition['type'];
            }
        }

        return $types;
    }

    public function hasScheduleSetup(): bool
    {
        return is_string($this->shift_start_time)
            && trim($this->shift_start_time) !== ''
            && is_string($this->shift_end_time)
            && trim($this->shift_end_time) !== '';
    }

    public function formattedShiftStartTime(): ?string
    {
        return $this->formatTimeValue($this->shift_start_time);
    }

    public function formattedShiftEndTime(): ?string
    {
        return $this->formatTimeValue($this->shift_end_time);
    }

    public function scheduleStartForDate(CarbonInterface $date): ?CarbonImmutable
    {
        $value = $this->formattedShiftStartTime();

        if ($value === null) {
            return null;
        }

        return CarbonImmutable::parse($date->toDateString().' '.$value);
    }

    public function scheduleEndForDate(CarbonInterface $date): ?CarbonImmutable
    {
        $value = $this->formattedShiftEndTime();

        if ($value === null) {
            return null;
        }

        $start = $this->scheduleStartForDate($date);
        $end = CarbonImmutable::parse($date->toDateString().' '.$value);

        if ($start !== null && $end->lessThanOrEqualTo($start)) {
            return $end->addDay();
        }

        return $end;
    }

    public function scheduleLabel(): ?string
    {
        $start = $this->formattedShiftStartTime();
        $end = $this->formattedShiftEndTime();

        if ($start === null || $end === null) {
            return null;
        }

        return "{$start} - {$end}";
    }

    public function isOvernightSchedule(): bool
    {
        $start = $this->formattedShiftStartTime();
        $end = $this->formattedShiftEndTime();

        if ($start === null || $end === null) {
            return false;
        }

        return $end <= $start;
    }

    public static function labelFor(string $type): string
    {
        return self::metaFor($type)['label'];
    }

    public static function sequenceFor(string $type): int
    {
        return self::metaFor($type)['sequence'];
    }

    /**
     * @return array{label: string, field: string, sequence: int}
     */
    public static function metaFor(string $type): array
    {
        if (! isset(self::BREAK_TYPES[$type])) {
            throw new InvalidArgumentException("Unsupported break type [{$type}].");
        }

        return self::BREAK_TYPES[$type];
    }

    private function formatTimeValue(mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return substr($value, 0, 5);
    }
}
