<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'name' => is_string($this->input('name'))
                ? trim($this->input('name'))
                : $this->input('name'),
            'email' => is_string($this->input('email'))
                ? mb_strtolower(trim($this->input('email')))
                : $this->input('email'),
        ]);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, array<int, string|\Illuminate\Contracts\Validation\ValidationRule|\Illuminate\Validation\Rules\Password>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'string',
                'email',
                'lowercase',
                'max:255',
                Rule::unique('users', 'email'),
            ],
            'password' => ['required', 'confirmed', \Illuminate\Validation\Rules\Password::min(8)],
        ];
    }
}
