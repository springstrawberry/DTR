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
            $table->string('shift_start_time', 5)->nullable()->after('afternoon_break_minutes');
            $table->string('shift_end_time', 5)->nullable()->after('shift_start_time');
            $table->unsignedInteger('grace_minutes')->default(0)->after('shift_end_time');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('attendance_settings', function (Blueprint $table) {
            $table->dropColumn(['shift_start_time', 'shift_end_time', 'grace_minutes']);
        });
    }
};
