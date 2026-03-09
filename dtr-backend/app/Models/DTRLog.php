<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DTRLog extends Model
{
    protected $table = 'dtrlogs';

    protected $fillable = [
        'user_id',
        'date',
        'time_in',
        'lunch_out',
        'lunch_in',
        'time_out',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'date' => 'date',
            'time_in' => 'datetime',
            'lunch_out' => 'datetime',
            'lunch_in' => 'datetime',
            'time_out' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
