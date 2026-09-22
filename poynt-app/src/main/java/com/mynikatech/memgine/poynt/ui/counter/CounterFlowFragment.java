package com.mynikatech.memgine.poynt.ui.counter;

import android.app.Fragment;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.mynikatech.memgine.poynt.R;

/** Lifecycle boundary for the native Counter flow. */
public final class CounterFlowFragment extends Fragment {
    private CounterFlowController controller;

    @Override public View onCreateView(LayoutInflater inflater, ViewGroup parent, Bundle state) {
        return inflater.inflate(R.layout.fragment_counter_flow, parent, false);
    }

    @Override public void onViewCreated(View view, Bundle state) {
        super.onViewCreated(view, state);
        controller = new CounterFlowController(requireActivity(),
                (FrameLayout) view.findViewById(R.id.counter_flow_root));
        controller.start();
    }

    public boolean navigateBack() { return controller != null && controller.navigateBack(); }

    @Override public void onDestroyView() {
        if (controller != null) controller.close();
        controller = null;
        super.onDestroyView();
    }

    private android.app.Activity requireActivity() {
        if (getActivity() == null) throw new IllegalStateException("Counter host is unavailable");
        return getActivity();
    }
}
