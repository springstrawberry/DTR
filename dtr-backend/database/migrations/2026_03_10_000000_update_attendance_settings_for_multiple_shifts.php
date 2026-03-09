<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('attendance_settings', function (Blueprint $table) {
            // Drop the unique constraint on user_id to allow multiple shifts per user
            $table->dropUnique(['user_id']);
            
            // Add columns for shift name and active status
            $table->string('shift_name')->default('Regular Shift')->after('user_id');
            $table->boolean('attend_status')->default(true)->after('afternoon_break_minutes');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('attendance_settings', function (Blueprint $table) {
            $table->dropColumn(['shift_name', 'attend_status']);
            $table->unique('user_id');
        });
    }
};
