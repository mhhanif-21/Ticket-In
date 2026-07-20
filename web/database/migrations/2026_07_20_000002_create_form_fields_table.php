<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('form_fields', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('event_id')->constrained('events')->cascadeOnDelete();
            $table->string('field_name');
            $table->string('field_type');
            $table->boolean('is_required')->default(false);
            $table->jsonb('options')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('form_fields');
    }
};
