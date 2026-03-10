<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dtrlogs', function (Blueprint $table) {
            $table->foreignId('attendance_id')
                ->nullable()
                ->after('user_id')
                ->constrained('attendance_settings')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('dtrlogs', function (Blueprint $table) {
            $table->dropForeignKeyIfExists(['attendance_id']);
            $table->dropColumn('attendance_id');
        });
    }
};
