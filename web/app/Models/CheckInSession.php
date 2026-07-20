<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class CheckInSession extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'event_id', 'volunteer_name', 'started_at', 'ended_at'
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function event()
    {
        return $this->belongsTo(Event::class);
    }

    public function checkInLogs()
    {
        return $this->hasMany(CheckInLog::class);
    }
}
