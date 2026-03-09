<?php

namespace App\Services;

use App\Models\User;

class UserService
{
    private DTRLogService $dtrLogService;

    public function __construct(?DTRLogService $dtrLogService = null)
    {
        $this->dtrLogService = $dtrLogService ?? new DTRLogService();
    }

    public function getTotalWorkedHours(User $user): float
    {
        $dtrLogs = $user->relationLoaded('dtrLogs')
            ? $user->getRelation('dtrLogs')
            : $user->dtrLogs()->with('breaks')->get();

        return $this->dtrLogService->calculateTotalHours($dtrLogs);
    }
}
