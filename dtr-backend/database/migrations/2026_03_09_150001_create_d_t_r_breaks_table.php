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
        Schema::create('dtr_breaks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dtr_log_id')->constrained('dtrlogs')->cascadeOnDelete();
            $table->string('break_type', 32);
            $table->timestamp('break_out')->nullable();
            $table->timestamp('break_in')->nullable();
            $table->unsignedInteger('allowed_minutes')->default(0);
            $table->unsignedInteger('exceeded_minutes')->default(0);
            $table->timestamps();

            $table->unique(['dtr_log_id', 'break_type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('dtr_breaks');
    }
};
