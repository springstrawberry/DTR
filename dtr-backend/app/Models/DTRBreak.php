<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DTRBreak extends Model
{
    protected $table = 'dtr_breaks';

    protected $fillable = [
        'dtr_log_id',
        'break_type',
        'break_out',
        'break_in',
        'allowed_minutes',
        'exceeded_minutes',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'break_out' => 'datetime',
            'break_in' => 'datetime',
            'allowed_minutes' => 'integer',
            'exceeded_minutes' => 'integer',
        ];
    }

    public function dtrLog(): BelongsTo
    {
        return $this->belongsTo(DTRLog::class, 'dtr_log_id');
    }
}
