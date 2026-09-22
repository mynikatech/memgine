package com.mynikatech.memgine.poynt.ui.counter;

import android.content.Context;
import android.graphics.Color;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.mynikatech.memgine.poynt.R;

/** Resource-backed classic View factory shared by native Counter screens. */
final class CounterViews {
    private CounterViews() { }
    static TextView title(Context context, String value) { TextView view=text(context,value); view.setTextSize(24); view.setTextColor(context.getResources().getColor(R.color.memgine_text)); view.setPadding(0,8,0,10); return view; }
    static TextView text(Context context, String value) { TextView view=new TextView(context); view.setText(value); view.setTextSize(16); view.setTextColor(context.getResources().getColor(R.color.memgine_text)); view.setPadding(2,7,2,7); return view; }
    static TextView muted(Context context,String value) { TextView view=text(context,value); view.setTextSize(14); view.setTextColor(context.getResources().getColor(R.color.memgine_muted)); return view; }
    static LinearLayout card(Context context) { LinearLayout view=new LinearLayout(context); view.setOrientation(LinearLayout.VERTICAL); view.setBackgroundResource(R.drawable.memgine_card); LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2); p.setMargins(0,8,0,8); view.setLayoutParams(p); return view; }
    static Button button(Context context,String value,boolean primary) { return button(context,value,primary,false); }
    static Button button(Context context,String value,boolean primary,boolean selected) { Button view=new Button(context); view.setAllCaps(false); view.setText(value); view.setTextSize(16); view.setGravity(Gravity.CENTER); view.setMinHeight((int)context.getResources().getDimension(R.dimen.memgine_control_height)); view.setTextColor(primary ? Color.WHITE : context.getResources().getColor(R.color.memgine_text)); view.setBackgroundResource(primary ? R.drawable.memgine_button_primary : selected ? R.drawable.memgine_button_selected : R.drawable.memgine_button_secondary); LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2); p.setMargins(0,5,0,5); view.setLayoutParams(p); return view; }
    static EditText input(Context context,String hint) { EditText view=new EditText(context); view.setHint(hint); view.setTextSize(16); view.setInputType(InputType.TYPE_CLASS_TEXT); view.setPadding(16,8,16,8); view.setBackgroundResource(R.drawable.memgine_card); LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,6,0,6);view.setLayoutParams(p);return view; }
}
