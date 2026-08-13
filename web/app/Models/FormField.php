<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class FormField extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'event_id', 'field_name', 'field_type', 'is_required', 'options'
    ];

    protected $casts = [
        'is_required' => 'boolean',
        'options' => 'array',
    ];

    public function event()
    {
        return $this->belongsTo(Event::class);
    }
}
