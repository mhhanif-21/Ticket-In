<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Event extends Model
{
    use HasUuids;

    protected $fillable = [
        'name', 'slug', 'description', 'location', 'date', 
        'poster_url', 'capacity', 'registration_mode', 'volunteer_pin_hash'
    ];

    protected $casts = [
        'date' => 'datetime',
    ];

    public function formFields()
    {
        return $this->hasMany(FormField::class);
    }

    public function registrations()
    {
        return $this->hasMany(Registration::class);
    }

    public function checkInSessions()
    {
        return $this->hasMany(CheckInSession::class);
    }
}
