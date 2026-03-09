<?php

use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\AuthController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('api.token')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

Route::middleware('api.token')->prefix('attendance')->group(function (): void {
    Route::get('/', [AttendanceController::class, 'index']);
    Route::match(['post', 'put'], '/settings', [AttendanceController::class, 'updateSettings']);
    Route::post('/actions/{action}', [AttendanceController::class, 'store']);
    Route::post('/settings/{setting}/switch', [AttendanceController::class, 'switchAttendanceSetting']);
});
